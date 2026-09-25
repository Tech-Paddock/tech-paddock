/**
 * A roaster's recipe published as a picture (TEC-47, under the rule in TEC-46).
 *
 * Some roasters print their recipe only as an image — Middlestate puts a
 * recipe card in the product gallery — and `web_fetch` hands the search model
 * a page as text, so the card never reaches it. The search answers `none`, and
 * a suggestion then takes the place of a recipe the roaster did publish.
 *
 * This is the rule half of reading those images, kept pure for the reason
 * `lib/searchRun.ts` is: the SDK call and the fetches are plumbing in
 * `lib/anthropic.ts`, and a rule that can only be exercised by a live call is
 * a rule with no tests. What is decided here:
 *
 * - **which images count** — the product gallery's, and nothing else on the
 *   page, so a related product's card is never read as this coffee's;
 * - **what a copy-out becomes** — a `RawGuide` that goes through
 *   `validateGuide` like any other, with the text read off the image as the
 *   quote, the **page** as the quote's URL, and the image stored beside it;
 * - **which recipe is stored** — filter or batch over espresso (Joel,
 *   2026-09-25: *"Always prefer filter/batch over espresso."*). The one not
 *   chosen is not a dropped value: it was not chosen, and it is not a failure;
 * - **which answer the bag keeps** — the image's or the text search's.
 *
 * The one thing this cannot check is whether the copy-out copied. That is why
 * the image is stored and always shown beside the values it backs.
 */

import { GUIDE_FIELDS, validateGuide, webHost, type Guide, type GuideField, type ImageSource, type Quote, type RawGuide } from "./guide";
import { normalizeMethod } from "./methods";
import type { SearchOutcome } from "./searchRun";

export type CardImage = ImageSource;

/** How many gallery images one read looks at. A gallery is a handful of photos and, sometimes, the card. */
export const MAX_CARD_IMAGES = 6;

// ---------------------------------------------------------------------------
// Where the server may go
// ---------------------------------------------------------------------------

/**
 * A URL the server may fetch: a public web page by name.
 *
 * The product URL comes from a model's answer and the image URLs from a page
 * nobody here wrote, so both are refused unless they name a real public host —
 * no IP literal, no single-label or internal name, no port but the web's own.
 * The server is not a proxy for whatever a page points at.
 */
export function isFetchableUrl(url: string | null | undefined): boolean {
  if (!webHost(url)) return false;
  let parsed: URL;
  try {
    parsed = new URL((url as string).trim());
  } catch {
    return false;
  }
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.port && parsed.port !== "80" && parsed.port !== "443") return false;
  if (parsed.username || parsed.password) return false;
  if (hostname.startsWith("[") || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;
  if (!hostname.includes(".")) return false;
  if (/(^|\.)(localhost|local|internal|localdomain|home|lan)$/.test(hostname)) return false;
  return true;
}

/**
 * The same image at a size the vision call takes without complaint.
 *
 * Squarespace and Shopify serve originals by default, and an original card
 * can be several megabytes. Both CDNs resize on a query parameter, so the
 * image read — and the one stored and shown — is the same picture at 1500px.
 * Every other host is left exactly as the page gave it.
 */
export function sizedImageUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "images.squarespace-cdn.com" || host.endsWith(".squarespace-cdn.com")) {
    parsed.searchParams.set("format", "1500w");
    return parsed.toString();
  }
  if (host === "cdn.shopify.com" || parsed.pathname.startsWith("/cdn/shop/")) {
    parsed.searchParams.set("width", "1500");
    return parsed.toString();
  }
  return url;
}

// ---------------------------------------------------------------------------
// The gallery
// ---------------------------------------------------------------------------

/**
 * An element whose class or id says it holds the product's own images:
 * Squarespace's `ProductItem-gallery` and `product-gallery`, Shopify's
 * `product__media` and `product-single__photos`, WooCommerce's
 * `woocommerce-product-gallery`, and the plain `product-images` of many themes.
 */
const GALLERY = /gallery|product[-_]{0,2}(?:single[-_]{0,2})?(?:media|images?|photos?|slides?|slideshow)/i;

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);

function attributes(tag: string): Map<string, string> {
  const out = new Map<string, string>();
  const pattern = /([^\s=\/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(tag))) {
    const name = m[1].toLowerCase();
    if (!out.has(name)) out.set(name, decodeEntities(m[2] ?? m[3] ?? m[4] ?? ""));
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** The widest candidate in a `srcset`, or the last one when none says its width. */
function widestInSrcset(srcset: string): string | null {
  let best: { url: string; w: number } | null = null;
  for (const part of srcset.split(",")) {
    const [url, descriptor] = part.trim().split(/\s+/);
    if (!url) continue;
    const w = descriptor?.endsWith("w") ? Number.parseInt(descriptor, 10) || 0 : 0;
    if (!best || w >= best.w) best = { url, w };
  }
  return best?.url ?? null;
}

/**
 * The image an `<img>` really shows. Lazy-loading themes put a placeholder in
 * `src` and the real URL in `data-src` or `data-image` — Squarespace does
 * both — so those are read first.
 */
function imageUrlOf(attrs: Map<string, string>): string | null {
  for (const key of ["data-image", "data-src", "src"]) {
    const v = attrs.get(key)?.trim();
    if (v && !v.startsWith("data:")) return v;
  }
  for (const key of ["data-srcset", "srcset"]) {
    const v = attrs.get(key);
    if (v) return widestInSrcset(v);
  }
  return null;
}

function absolute(url: string, pageUrl: string): string | null {
  try {
    const resolved = new URL(url, pageUrl).toString();
    return webHost(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

/**
 * The images in this coffee's own product gallery, in page order, at most
 * `limit` of them.
 *
 * **Only the gallery.** A product page also carries a logo, a team photo and
 * the related products' images — and a related coffee's recipe card read as
 * this one's would be a recipe for the wrong coffee under this coffee's name.
 * When no gallery is recognisable, the page's own `og:image` stands in: it is
 * the picture the page names as its own. Nothing else is reached for.
 *
 * Not an HTML parser, and it does not need to be: it tracks element nesting
 * well enough to know whether an `<img>` sits inside a gallery element, and
 * it never throws — a page it cannot read yields no images, which the caller
 * treats as nothing to read.
 */
export function galleryImagesIn(html: string, pageUrl: string, limit: number = MAX_CARD_IMAGES): CardImage[] {
  if (typeof html !== "string" || !html) return [];
  const source = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi, "");

  const found: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | null) => {
    if (!raw || found.length >= limit) return;
    const abs = absolute(raw, pageUrl);
    if (!abs || /\.svg(\?|#|$)/i.test(abs)) return;
    // The same picture at two sizes is one picture.
    const key = abs.replace(/[?#].*$/, "");
    if (seen.has(key)) return;
    seen.add(key);
    found.push(sizedImageUrl(abs));
  };

  let ogImage: string | null = null;
  const stack: { name: string; gallery: boolean }[] = [];
  const tags = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = tags.exec(source))) {
    const [, closing, rawName, rest] = m;
    const name = rawName.toLowerCase();
    if (closing) {
      const at = stack.map((e) => e.name).lastIndexOf(name);
      if (at >= 0) stack.length = at;
      continue;
    }
    const attrs = attributes(rest);
    if (name === "meta" && !ogImage && (attrs.get("property") ?? attrs.get("name"))?.toLowerCase() === "og:image") {
      ogImage = attrs.get("content")?.trim() || null;
    }
    const inGallery = stack.some((e) => e.gallery);
    if (name === "img" && inGallery) add(imageUrlOf(attrs));
    if (VOID.has(name) || rest.trimEnd().endsWith("/")) continue;
    const marker = `${attrs.get("class") ?? ""} ${attrs.get("id") ?? ""}`;
    stack.push({ name, gallery: GALLERY.test(marker) });
  }

  if (found.length === 0 && ogImage) add(ogImage);
  return found.map((url) => ({ url, inGallery: true }));
}

// ---------------------------------------------------------------------------
// When to look
// ---------------------------------------------------------------------------

/**
 * Whether the text search's answer leaves the product page's images worth
 * reading: it came back below tier 1, and there is a product page to read.
 */
export function shouldReadImages(guide: Guide): boolean {
  return guide.status !== "coffee_specific" && isFetchableUrl(guide.product_url);
}

// ---------------------------------------------------------------------------
// The copy-out
// ---------------------------------------------------------------------------

const PRINTED = (f: GuideField) => `${f}_printed`;

/**
 * What the vision call is asked for: every recipe printed on the images, one
 * per column, each value beside the exact text it was copied from. Every key
 * is required and nullable, so "not printed" is an explicit null rather than
 * a key the model left out.
 */
export const RECIPE_CARD_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    recipes: {
      type: "array" as const,
      items: {
        type: "object" as const,
        additionalProperties: false,
        properties: {
          image: { type: "integer" },
          heading: { type: ["string", "null"] },
          ...Object.fromEntries(
            GUIDE_FIELDS.flatMap((f) => [
              [f, { type: ["string", "null"] }],
              [PRINTED(f), { type: ["string", "null"] }],
            ])
          ),
        },
        required: ["image", "heading", ...GUIDE_FIELDS.flatMap((f) => [f, PRINTED(f)])],
      },
    },
  },
  required: ["recipes"],
};

/** Filter covers pour-over, batch and immersion — anything placed that is not espresso. */
export type RecipeKind = "filter" | "espresso" | "unknown";

export type CardRecipe = {
  kind: RecipeKind;
  /** The image it was read off, or null when it named one the reader was not shown. */
  image: string | null;
  raw: RawGuide;
  /** How many values it carries with the text they were copied from. */
  backed: number;
};

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Each recipe on the card as the raw guide it would be. Nothing here decides
 * what is kept — `validateGuide` does, as it does for text — so this only
 * reshapes. Never throws: a malformed copy-out is no recipes.
 *
 * **A printed column heading is printed text.** "batch" at the top of a
 * column is how Middlestate says what the column is for, so it is the method
 * when nothing else names one, and part of the method's quote when something
 * does — the method is then normalised from that quote, as it always is.
 */
export function recipesOnCard(copyOut: unknown, images: readonly CardImage[], pageUrl: string): CardRecipe[] {
  const list = (copyOut as { recipes?: unknown } | null | undefined)?.recipes;
  if (!Array.isArray(list)) return [];

  const out: CardRecipe[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    const index = typeof r.image === "number" && Number.isInteger(r.image) ? r.image : 0;
    const image = images[index - 1]?.url ?? null;
    const heading = text(r.heading);

    const params: Partial<Record<GuideField, string>> = {};
    const quotes: Quote[] = [];
    let backed = 0;
    for (const field of GUIDE_FIELDS) {
      let value = text(r[field]);
      let printed = text(r[PRINTED(field)]);
      if (field === "method") {
        printed = [heading, printed].filter(Boolean).join(" · ") || null;
        value = value ?? heading;
      }
      if (!value) continue;
      params[field] = value;
      if (!printed) continue;
      quotes.push({ field, text: printed, url: pageUrl, ...(image ? { image } : {}) });
      backed++;
    }

    const placed = normalizeMethod([heading, text(r[PRINTED("method")])].filter(Boolean).join(" ") || null);
    const kind: RecipeKind = placed === null ? "unknown" : placed === "espresso" ? "espresso" : "filter";

    out.push({
      kind,
      image,
      raw: { status: "coffee_specific", product_url: pageUrl, guide_url: pageUrl, params, quotes },
      backed,
    });
  }
  return out;
}

const KIND_RANK: Record<RecipeKind, number> = { filter: 0, unknown: 1, espresso: 2 };

/**
 * The one recipe a bag stores when the card prints more than one.
 *
 * Filter or batch first, then a recipe that cannot be placed, and espresso only
 * when it is all there is — a recipe that cannot be placed is not known to be
 * espresso, and espresso is the one the rule says to pass over. Within a kind,
 * the recipe with more backed values wins, then the first printed.
 */
export function chooseRecipe(recipes: readonly CardRecipe[]): CardRecipe | null {
  const candidates = recipes.filter((r) => Object.keys(r.raw.params ?? {}).length > 0);
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || b.backed - a.backed)[0];
}

/**
 * A copy-out to a validated guide.
 *
 * `page.url` is the product page as the bag knows it, which is what every
 * quote cites. `page.reachedUrl` is where the server's fetch of it ended up
 * after redirects — the evidence that it was reached, and the check that a
 * redirect to somewhere else is not read as the roaster's site.
 */
export function imageGuide(
  copyOut: unknown,
  page: { url: string; reachedUrl: string },
  images: readonly CardImage[]
): { guide: Guide; espresso: boolean } {
  const reached = [webHost(page.reachedUrl)].filter((h): h is string => !!h);
  const chosen = chooseRecipe(recipesOnCard(copyOut, images, page.url));
  if (!chosen) {
    return { guide: validateGuide({ status: "none", product_url: page.url }, reached, images), espresso: false };
  }
  return { guide: validateGuide(chosen.raw, reached, images), espresso: chosen.kind === "espresso" };
}

// ---------------------------------------------------------------------------
// Which answer the bag keeps
// ---------------------------------------------------------------------------

export type ImageRead =
  /** Not attempted: tier 1 already, or no product page. */
  | { kind: "skipped" }
  /** Attempted and could not finish. The text answer stands, and says so. */
  | { kind: "failed"; message: string }
  /** Read. The guide may still be `none`, which is an answer. */
  | { kind: "read"; guide: Guide; espresso: boolean };

const TIER: Record<string, number> = { coffee_specific: 2, roaster_generic: 1 };

/**
 * The text search's outcome and the image read's, to the one the bag records.
 *
 * - **A higher tier wins**, so a recipe card in this coffee's gallery beats
 *   the roaster's house guide, and anything found beats `none`.
 * - **Except that filter beats espresso** — an espresso-only card does not
 *   displace a filter recipe the text search already found, whatever its tier.
 * - **Dropped values from both are kept.** They are surfaced, never discarded.
 * - **A read that failed is said beside the answer.** A `none` recorded
 *   without reading the card is not the same `none` as one that read it and
 *   found nothing, and an empty result and an unread one must not render the
 *   same.
 */
export function combineReads(text: SearchOutcome, read: ImageRead): SearchOutcome {
  if (read.kind === "skipped") return text;

  if (read.kind === "failed") {
    const note =
      "The recipe images on the product page could not be read, so a recipe printed only as a picture may have " +
      `been missed — ${read.message}.`;
    return { guide: text.guide, warning: text.warning ? `${text.warning} ${note}` : note };
  }

  const textTier = TIER[text.guide.status] ?? 0;
  const imageTier = TIER[read.guide.status] ?? 0;
  const filterAlreadyFound = textTier > 0 && text.guide.method !== "espresso";
  const replace = imageTier > textTier && !(read.espresso && filterAlreadyFound);

  if (replace) {
    // The text run's warning described its own `none`, which is no longer the answer.
    return { guide: { ...read.guide, dropped: [...read.guide.dropped, ...text.guide.dropped] }, warning: null };
  }
  if (read.guide.dropped.length === 0) return text;
  return { guide: { ...text.guide, dropped: [...text.guide.dropped, ...read.guide.dropped] }, warning: text.warning };
}
