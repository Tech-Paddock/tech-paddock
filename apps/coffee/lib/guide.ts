import { normalizeMethod, type BrewMethod } from "./methods";

// The rule this tool lives or dies on: a model with web search will happily
// produce a plausible 1:16 / 205F / 3:00 recipe for a page that says nothing
// about brewing, and unlike a bad message draft you would actually brew it.
// So nothing reaches the database unless the model also produced the sentence
// it came from and the URL that sentence was on. This module is where that is
// enforced — not in the prompt, which can only ask.

export const GUIDE_FIELDS = [
  "method",
  "ratio",
  "dose",
  "water",
  "temp",
  "grind",
  "time",
] as const;

export type GuideField = (typeof GUIDE_FIELDS)[number];

export type GuideStatus = "coffee_specific" | "roaster_generic" | "none" | "not_searched";

/**
 * One backed value's evidence. `url` is always the page. `image` is set only
 * for a value read off a picture on that page (TEC-46): the image the text was
 * copied from, stored so it can be shown beside the value it backs.
 */
export type Quote = { field: GuideField; text: string; url: string; image?: string };

/** An image the recipe reader was shown, and whether it is in this coffee's own gallery. */
export type ImageSource = { url: string; inGallery: boolean };

/** What the model hands back, before any of it is trusted. */
export type RawGuide = {
  status?: string;
  product_url?: string | null;
  guide_url?: string | null;
  params?: Partial<Record<GuideField, string | null>>;
  quotes?: Quote[];
};

export type Guide = {
  status: GuideStatus;
  product_url: string | null;
  guide_url: string | null;
  method: BrewMethod | null;
  params: Partial<Record<Exclude<GuideField, "method">, string>>;
  quotes: Quote[];
  /** Values the model asserted but could not back. Surfaced, never stored as fact. */
  dropped: { field: GuideField; value: string; reason: string }[];
};

/**
 * A web page's host, `www.` stripped and lowercased, or null.
 *
 * **Only `http:` and `https:` are pages.** `new URL("javascript:alert(1)")`
 * parses without complaint, and a URL this app stores is one it links
 * straight out to — so anything but a web address is not a page, whatever the
 * model called it.
 */
export function webHost(url: string | null | undefined): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

const host = webHost;

/** Same registrable site, so "sweetbloomcoffee.com" covers "shop.sweetbloomcoffee.com". */
function sameSite(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/**
 * Reduce a model response to only what it can back, and decide which tier
 * actually answered. Never throws: a malformed response is a guide with
 * status "none", which is a legitimate outcome rather than an error.
 *
 * **"Legitimate" is about the payload, not about the run.** A `none` here
 * means this response backed nothing; whether the run was in a position to
 * find anything is a separate question, and `lib/searchRun.ts` answers it
 * before the answer is allowed anywhere near the row.
 */
export function validateGuide(
  raw: RawGuide,
  reachedHosts: readonly string[],
  /**
   * Set only when the values were read off images (TEC-46): the images the
   * reader was actually shown. Every value then needs a quote carrying one of
   * them, and tier 1 needs every one of them to be in this coffee's gallery.
   * Left out, the values are text off a page, and any `image` a quote carries
   * is stripped — only the image reader may put a picture beside a value.
   */
  images?: readonly ImageSource[]
): Guide {
  // A URL that is not a web page is no URL at all: it is neither stored nor
  // accepted as the page a quote was read on.
  const productUrl = host(raw.product_url) ? (raw.product_url as string).trim() : null;
  const guideUrl = host(raw.guide_url) ? (raw.guide_url as string).trim() : null;
  const dropped: Guide["dropped"] = [];

  const readable = new Set([productUrl, guideUrl].filter(Boolean) as string[]);

  // A quote counts only if it has real text and points at a page the model
  // says it read. Anything else is a citation to nowhere.
  const cited = (Array.isArray(raw.quotes) ? raw.quotes : []).filter(
    (q): q is Quote =>
      !!q &&
      typeof q.text === "string" &&
      q.text.trim().length > 0 &&
      typeof q.url === "string" &&
      readable.has(q.url) &&
      (GUIDE_FIELDS as readonly string[]).includes(q.field)
  );

  // A copy-out is a reading of a picture, not a quotation of the page's text,
  // so it is only as checkable as the picture shown next to it: a value read
  // off an image with no image stored to show is dropped (TEC-46). Each quote
  // is rebuilt rather than passed through, so nothing else the model added to
  // it reaches the row.
  const shown = new Map((images ?? []).map((i) => [i.url, i]));
  const imageless = new Set<GuideField>();
  const quotes: Quote[] = [];
  for (const q of cited) {
    const base = { field: q.field, text: q.text, url: q.url };
    if (!images) quotes.push(base);
    else if (typeof q.image === "string" && shown.has(q.image)) quotes.push({ ...base, image: q.image });
    else imageless.add(q.field);
  }

  const backing = new Map<GuideField, Quote>();
  for (const q of quotes) if (!backing.has(q.field)) backing.set(q.field, q);

  const params: Guide["params"] = {};
  let method: BrewMethod | null = null;

  for (const field of GUIDE_FIELDS) {
    const value = raw.params?.[field];
    if (typeof value !== "string" || !value.trim()) continue;

    const quote = backing.get(field);
    if (!quote) {
      dropped.push({
        field,
        value,
        reason: imageless.has(field) ? "no image stored to show beside it" : "no source sentence",
      });
      continue;
    }

    if (field === "method") {
      // Normalize from the roaster's own sentence, not from the label the
      // model chose, so the mapping can be checked against the stored quote.
      method = normalizeMethod(quote.text) ?? normalizeMethod(value);
    } else {
      params[field] = value.trim();
    }
  }

  const found = method !== null || Object.keys(params).length > 0;
  if (!found || !guideUrl) {
    return { status: "none", product_url: productUrl, guide_url: null, method: null, params: {}, quotes: [], dropped };
  }

  // Tier 2 is "the roaster's own site only", and since 2026-09-22 this is the
  // whole of that constraint: nothing is pinned up front. Until 2026-09-25 it
  // was anchored on the product URL the model *reported*, and with no product
  // URL there was no check at all — a guide read off a blog, with no product
  // page named, went straight through.
  //
  // Two things have to hold now, and neither rests on the model's word alone:
  //
  // - **There is a product page on a real web host.** The roaster's site is
  //   the site this coffee is sold on; with no product page nothing says
  //   whose site the guide was read on.
  // - **The guide was read on a host this run actually reached** — one the
  //   fetch tool returned or the search tool listed, taken off the response
  //   blocks by `lib/searchRun.ts` rather than off the answer — and it is the
  //   same site as the product page. A retailer selling the coffee is a
  //   different site from the roaster's, so it fails even when it was reached.
  const productHost = host(productUrl);
  const guideHost = host(guideUrl);
  const reached = reachedHosts.map((h) => host(`https://${h.replace(/^https?:\/\//, "")}`));
  const refusal = !productHost
    ? "no product page was named, so nothing says whose site this is"
    : !sameSite(guideHost, productHost)
      ? `read from ${guideHost ?? "an unknown host"}, not the roaster's site`
      : !reached.some((h) => sameSite(guideHost, h))
        ? `read from ${guideHost}, which this search never reached`
        : null;

  if (refusal) {
    return {
      status: "none",
      product_url: productUrl,
      guide_url: null,
      method: null,
      params: {},
      quotes: [],
      dropped: [
        ...dropped,
        ...GUIDE_FIELDS.filter((f) => backing.has(f)).map((field) => ({
          field,
          value: String(raw.params?.[field] ?? ""),
          reason: refusal,
        })),
      ],
    };
  }

  // A guide on a page other than this coffee's own is the roaster's house
  // method however the model labelled it, so tier 1 has to be earned rather
  // than claimed: we only keep it when the instructions were read on the
  // product page itself. Everything else that found something is tier 2.
  //
  // Read off an image, the place is the picture's as well as the page's: only
  // an image in this coffee's own product gallery can earn tier 1, and one
  // anywhere else on the site is the roaster's house material (TEC-46).
  const kept = quotes.filter((q) => q.field === "method" || params[q.field as Exclude<GuideField, "method">]);
  const inGallery = !images || kept.every((q) => shown.get(q.image as string)?.inGallery === true);
  const status: GuideStatus =
    raw.status === "coffee_specific" && productUrl && guideUrl === productUrl && inGallery
      ? "coffee_specific"
      : "roaster_generic";

  return {
    status,
    product_url: productUrl,
    guide_url: guideUrl,
    method,
    params,
    quotes: kept,
    dropped,
  };
}
