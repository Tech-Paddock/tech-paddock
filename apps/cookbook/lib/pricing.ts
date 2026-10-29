import { searchTerm, type Product } from "./kroger";
import { lineTerm, type Decision } from "./cart";

/**
 * Prices at the chosen store: the deal scan (TEC-121). The live estimated total
 * is gone (TEC-190): list totals are summed from the nightly check
 * (`lib/listPrices.ts`).
 *
 * **Pure, with Kroger passed in**, like `lib/cart.ts` and `lib/refresh.ts`;
 * `lib/dealRun.ts` supplies the token and the store. **No model call.**
 *
 * - **What a line is priced as** is what Send would put in the cart: a saved
 *   product in Your brands (the most counted, when several match), else
 *   Kroger's top match for the item alone (or for a phrase's search words).
 * - **A deal is a promo below the regular price**, both from Kroger at the
 *   store. Coupons are not read (the public API has none); staged coupons are
 *   `lib/couponStore.ts`'s.
 */

export type Target =
  | { kind: "id"; productId: string }
  | { kind: "term"; term: string }
  | { kind: "none"; reason: string };

/**
 * What a line is looked up as. The same choice `planLine` makes for Send: the
 * saved product it goes in as — the only one, its default or the one it names,
 * else the most counted (Pick one's pre-pick) — or Kroger's top match for a
 * phrase's words or for the item alone (TEC-131). **A product found only by
 * its Kroger name is unconfirmed until Send checks it** (TEC-135), so it is
 * priced as Kroger's top match for the item, what Send falls back to.
 */
export function targetFor(name: string, decision: Decision, note: string | null = null): Target {
  if (decision?.kind === "products" && decision.via !== "description" && decision.candidates[0]) {
    return { kind: "id", productId: decision.candidates[0].upc };
  }
  const term = decision?.kind === "terms" ? searchTerm(decision.terms) : lineTerm(name, note);
  return term ? { kind: "term", term } : { kind: "none", reason: "too short for Kroger's search" };
}

export function targetKey(target: Target): string | null {
  if (target.kind === "id") return `id:${target.productId}`;
  if (target.kind === "term") return `term:${target.term.toLowerCase()}`;
  return null;
}

/** What Kroger said for one target: a product, nothing (`product: null`), or a refusal in words. */
export type Lookup = { product: Product | null; error: string | null };

export type LookupDeps = {
  /** Many products by ID at the store; one request per fifty (`productsByIds`). */
  byIds: (productIds: string[]) => Promise<Product[]>;
  /** Kroger's top match at the store (`topProduct`). */
  search: (term: string) => Promise<Product | null>;
};

function reason(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

/**
 * Every distinct target, looked up once. **IDs go in one batched lookup**;
 * searches run four at a time, as the cart review does, so a long list is not
 * thirty requests at once.
 */
export async function lookUp(targets: Target[], deps: LookupDeps): Promise<Map<string, Lookup>> {
  const found = new Map<string, Lookup>();
  const ids = [...new Set(targets.flatMap((t) => (t.kind === "id" ? [t.productId] : [])))];
  const terms = [...new Map(targets.flatMap((t) => (t.kind === "term" ? [[t.term.toLowerCase(), t.term] as const] : []))).values()];

  if (ids.length > 0) {
    try {
      const products = await deps.byIds(ids);
      for (const id of ids) {
        const product = products.find((p) => p.productId === id || p.upc === id) ?? null;
        found.set(`id:${id}`, { product, error: null });
      }
    } catch (e) {
      const why = reason(e, "Kroger's product lookup failed.");
      for (const id of ids) found.set(`id:${id}`, { product: null, error: why });
    }
  }

  let next = 0;
  async function worker() {
    while (next < terms.length) {
      const term = terms[next++];
      try {
        found.set(`term:${term.toLowerCase()}`, { product: await deps.search(term), error: null });
      } catch (e) {
        found.set(`term:${term.toLowerCase()}`, { product: null, error: reason(e, "Kroger's search failed.") });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, terms.length) }, worker));
  return found;
}

/** Why a target came back with nothing, in words. */
function nothingFor(target: Target): string {
  return target.kind === "id" ? "Kroger no longer returns that product at your store" : "Kroger has no match at your store";
}

const cents = (dollars: number) => Math.round(dollars * 100);

/** Whole percent off the regular price, or null when the product is not on sale (promo must be below regular). */
export function percentOff(product: Pick<Product, "regular" | "promo">): number | null {
  const { regular, promo } = product;
  if (promo === null || regular === null || !(promo < regular)) return null;
  // At least 1: a sale under half a percent is still a sale, and "0% off" would read as none.
  return Math.max(1, Math.round(((regular - promo) / regular) * 100));
}

// ---------------------------------------------------------------------------
// The deal scan
// ---------------------------------------------------------------------------

/** A brand as the scan needs it. */
export type ScanWords = { phrase: string; kind: "product" | "terms" | "plain"; terms: string | null };

export type ScanEntry = { name: string; target: Target };

/**
 * What the scan checks: **every saved product, every search-word phrase, then
 * every open line on the list** (TEC-131). A product is its code, named by its
 * first name; a phrase is Kroger's top match for its words. Duplicates
 * collapse in `lookUp` and merge their names in the deal.
 */
export function scanEntries(
  products: { product_id: string; names: string[] }[],
  words: ScanWords[],
  lines: { name: string; note?: string | null }[],
  decide: (name: string, note?: string | null) => Decision
): ScanEntry[] {
  const entries: ScanEntry[] = [];
  for (const p of products) {
    entries.push({ name: p.names[0] ?? p.product_id, target: { kind: "id", productId: p.product_id } });
  }
  for (const w of words) {
    if (w.kind === "product") continue;
    const term = searchTerm(w.kind === "terms" && w.terms ? w.terms : w.phrase);
    entries.push({ name: w.phrase, target: term ? { kind: "term", term } : { kind: "none", reason: "too short for Kroger's search" } });
  }
  for (const line of lines) entries.push({ name: line.name, target: targetFor(line.name, decide(line.name, line.note), line.note) });
  return entries;
}

export type Deal = {
  productId: string;
  description: string;
  size: string | null;
  url: string;
  regular: number;
  promo: number;
  /** Whole percent off the regular price. */
  percentOff: number;
  saving: number;
  /** When the sale ends, as Kroger gave it, or null. */
  endsAt: string | null;
  /** The brands and list lines this product stands for. */
  for: string[];
};

export type ScanResult = {
  /** Brands and list lines checked. */
  checked: number;
  /** On sale, biggest percentage off first. */
  deals: Deal[];
  /** Found at the store with no price: named, never read as $0 or as "not on sale". */
  unpriced: string[];
  /** Could not be checked, with why. */
  failed: { name: string; reason: string }[];
};

/**
 * Which checked products are on sale. **Ordered by the size of the saving as a
 * percentage**, then in dollars, because a third off a $2 item and a third off
 * a $12 item are the same kind of deal.
 */
export function findDeals(entries: ScanEntry[], found: Map<string, Lookup>): ScanResult {
  const deals = new Map<string, Deal>();
  const unpriced = new Set<string>();
  const failed: ScanResult["failed"] = [];

  for (const entry of entries) {
    const key = targetKey(entry.target);
    if (entry.target.kind === "none" || !key) {
      failed.push({ name: entry.name, reason: entry.target.kind === "none" ? entry.target.reason : "nothing to look up" });
      continue;
    }
    const lookup = found.get(key);
    if (!lookup || lookup.error) {
      failed.push({ name: entry.name, reason: lookup?.error ?? "not looked up" });
      continue;
    }
    const p = lookup.product;
    if (!p) {
      failed.push({ name: entry.name, reason: nothingFor(entry.target) });
      continue;
    }
    if (p.regular === null && p.promo === null) {
      unpriced.add(entry.name);
      continue;
    }
    const off = percentOff(p);
    if (off === null || p.promo === null || p.regular === null) continue;

    const existing = deals.get(p.productId);
    if (existing) {
      if (!existing.for.some((n) => n.toLowerCase() === entry.name.toLowerCase())) existing.for.push(entry.name);
      continue;
    }
    deals.set(p.productId, {
      productId: p.productId,
      description: p.description,
      size: p.size,
      url: p.url,
      regular: p.regular,
      promo: p.promo,
      percentOff: off,
      saving: (cents(p.regular) - cents(p.promo)) / 100,
      endsAt: p.promoEnds,
      for: [entry.name],
    });
  }

  const sorted = [...deals.values()].sort(
    (a, b) => b.percentOff - a.percentOff || b.saving - a.saving || a.description.localeCompare(b.description)
  );
  return { checked: entries.length, deals: sorted, unpriced: [...unpriced], failed };
}

export type ScanTrigger = "opened" | "manual";

/** One appended run, as `deal_scans` holds it and the list tab shows it. */
export type ScanRecord = ScanResult & {
  id: string;
  ran_at: string;
  trigger: ScanTrigger;
  location_id: string;
  store_name: string | null;
};

/** The scan in words. **A failure is always named**, so a scan that checked nothing never reads as "no deals". */
export function describeScan(result: ScanResult, store: string): string {
  const parts: string[] = [];
  parts.push(
    result.checked === 0
      ? "Nothing to scan: no saved brands and nothing on the list."
      : `Checked ${result.checked} at ${store}: ${result.deals.length} on sale.`
  );
  if (result.unpriced.length > 0) parts.push(`No price for ${result.unpriced.join(", ")}.`);
  if (result.failed.length > 0) parts.push(`Couldn't check ${result.failed.map((f) => `${f.name} (${f.reason})`).join("; ")}.`);
  return parts.join(" ");
}
