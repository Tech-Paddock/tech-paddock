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

export type Quote = { field: GuideField; text: string; url: string };

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

function host(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Same registrable site, so "sweetbloomcoffee.com" covers "shop.sweetbloomcoffee.com". */
function sameSite(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/**
 * Reduce a model response to only what it can back, and decide which tier
 * actually answered. Never throws: a malformed response is a guide with
 * status "none", which is a legitimate outcome rather than an error.
 */
export function validateGuide(raw: RawGuide, roasterDomain?: string | null): Guide {
  const productUrl = typeof raw.product_url === "string" && raw.product_url ? raw.product_url : null;
  const guideUrl = typeof raw.guide_url === "string" && raw.guide_url ? raw.guide_url : null;
  const dropped: Guide["dropped"] = [];

  const readable = new Set([productUrl, guideUrl].filter(Boolean) as string[]);

  // A quote counts only if it has real text and points at a page the model
  // says it read. Anything else is a citation to nowhere.
  const quotes = (Array.isArray(raw.quotes) ? raw.quotes : []).filter(
    (q): q is Quote =>
      !!q &&
      typeof q.text === "string" &&
      q.text.trim().length > 0 &&
      typeof q.url === "string" &&
      readable.has(q.url) &&
      (GUIDE_FIELDS as readonly string[]).includes(q.field)
  );

  const backing = new Map<GuideField, Quote>();
  for (const q of quotes) if (!backing.has(q.field)) backing.set(q.field, q);

  const params: Guide["params"] = {};
  let method: BrewMethod | null = null;

  for (const field of GUIDE_FIELDS) {
    const value = raw.params?.[field];
    if (typeof value !== "string" || !value.trim()) continue;

    const quote = backing.get(field);
    if (!quote) {
      dropped.push({ field, value, reason: "no source sentence" });
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

  // Tier 2 is "the roaster's own site only". allowed_domains pins the search,
  // but the search is not the only way a URL can enter the conversation, so
  // the constraint is re-checked here against what was actually read.
  const domain = roasterDomain ? host(`https://${roasterDomain.replace(/^https?:\/\//, "")}`) : null;
  const guideHost = host(guideUrl);
  const anchor = domain ?? host(productUrl);

  if (anchor && !sameSite(guideHost, anchor)) {
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
          reason: `read from ${guideHost ?? "an unknown host"}, not the roaster's site`,
        })),
      ],
    };
  }

  // A guide on a page other than this coffee's own is the roaster's house
  // method however the model labelled it, so tier 1 has to be earned rather
  // than claimed: we only keep it when the instructions were read on the
  // product page itself. Everything else that found something is tier 2.
  const status: GuideStatus =
    raw.status === "coffee_specific" && productUrl && guideUrl === productUrl ? "coffee_specific" : "roaster_generic";

  return {
    status,
    product_url: productUrl,
    guide_url: guideUrl,
    method,
    params,
    quotes: quotes.filter((q) => q.field === "method" || params[q.field as Exclude<GuideField, "method">]),
    dropped,
  };
}
