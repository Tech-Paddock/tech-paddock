import { searchTerm, type Product } from "./kroger";
import { lineTerm, type Decision } from "./cart";
import { modalityWord, type Modality } from "./modality";

/**
 * Prices at the chosen store: the estimated total and the deal scan (TEC-121).
 *
 * **Pure, with Kroger passed in**, like `lib/cart.ts` and `lib/refresh.ts`;
 * `lib/dealRun.ts` supplies the token and the store. **No model call.**
 *
 * - **What a line is priced as** is what Send would put in the cart: a saved
 *   product in Your brands (the most counted, when several match), else
 *   Kroger's top match for the item alone (or for a phrase's search words).
 * - **A line with no price is counted and named, never $0.** The total is an
 *   estimate and says so; it is Kroger's shelf price, promo first, before tax,
 *   fees and coupons.
 * - **A deal is a promo below the regular price**, both from Kroger at the
 *   store. Coupons are not read (the public API has none); each deal links to
 *   King Soopers' coupon search instead.
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
export function targetFor(name: string, decision: Decision): Target {
  if (decision?.kind === "products" && decision.via !== "description" && decision.candidates[0]) {
    return { kind: "id", productId: decision.candidates[0].upc };
  }
  const term = decision?.kind === "terms" ? searchTerm(decision.terms) : lineTerm(name);
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
// The estimated total
// ---------------------------------------------------------------------------

export type EstimateLine = { id: string; name: string; quantity: number; target: Target };

export type PricedLine = {
  id: string;
  name: string;
  quantity: number;
  description: string;
  url: string;
  /** The unit price used: promo first. */
  unit: number;
  onSale: boolean;
  /** The sale, when promo is below regular: what the list line's tag says (TEC-121 3a). */
  sale: { percentOff: number; endsAt: string | null } | null;
  lineTotal: number;
};

export type UnpricedLine = { id: string; name: string; quantity: number; reason: string };

export type Estimate = {
  modality: Modality;
  store: string;
  /** Null when no line could be priced: there is then no estimate, rather than $0. */
  total: number | null;
  priced: PricedLine[];
  unpriced: UnpricedLine[];
};

/** Whether the product is offered in this mode at the store; null when Kroger did not say. */
export function offeredFor(product: Product, modality: Modality): boolean | null {
  return modality === "PICKUP" ? product.pickup : product.delivery;
}

/**
 * Each line × its quantity at the store, promo first. **A line not offered for
 * the chosen mode is unpriced**, named with why, because it cannot be bought
 * that way; Kroger saying nothing about the mode is not read as no.
 */
export function estimate(lines: EstimateLine[], found: Map<string, Lookup>, modality: Modality, store: string): Estimate {
  const priced: PricedLine[] = [];
  const unpriced: UnpricedLine[] = [];
  const word = modalityWord(modality);

  for (const line of lines) {
    const base = { id: line.id, name: line.name, quantity: line.quantity };
    const key = targetKey(line.target);
    if (line.target.kind === "none" || !key) {
      unpriced.push({ ...base, reason: line.target.kind === "none" ? line.target.reason : "nothing to look up" });
      continue;
    }
    const lookup = found.get(key);
    if (!lookup || lookup.error) {
      unpriced.push({ ...base, reason: lookup?.error ?? "not looked up" });
      continue;
    }
    const product = lookup.product;
    if (!product) {
      unpriced.push({ ...base, reason: nothingFor(line.target) });
      continue;
    }
    if (offeredFor(product, modality) === false) {
      unpriced.push({ ...base, reason: `not offered for ${word} at your store` });
      continue;
    }
    if (product.price === null) {
      unpriced.push({ ...base, reason: "Kroger gave no price at your store" });
      continue;
    }
    const off = percentOff(product);
    priced.push({
      ...base,
      description: product.description,
      url: product.url,
      unit: product.price,
      onSale: off !== null,
      sale: off === null ? null : { percentOff: off, endsAt: product.promoEnds },
      lineTotal: (cents(product.price) * line.quantity) / 100,
    });
  }

  const total = priced.length === 0 ? null : priced.reduce((sum, p) => sum + cents(p.unit) * p.quantity, 0) / 100;
  return { modality, store, total, priced, unpriced };
}

export function dollars(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * The estimate in one sentence. **Always "estimated"**, and **unpriced lines are
 * counted and named** — "3 lines unpriced: …" — so a short total never reads
 * as the whole list.
 */
export function describeEstimate(e: Estimate): string {
  const word = modalityWord(e.modality);
  const n = (k: number) => `${k} line${k === 1 ? "" : "s"}`;
  const head =
    e.total === null
      ? `No line could be priced at ${e.store}, so there is no estimate.`
      : `Estimated total ${dollars(e.total)} for ${n(e.priced.length)}, ${word} at ${e.store} — Kroger's shelf prices, before tax, fees and coupons.`;
  if (e.unpriced.length === 0) return head;
  return `${head} ${n(e.unpriced.length)} unpriced: ${e.unpriced.map((u) => u.name).join(", ")}.`;
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
  lines: { name: string }[],
  decide: (name: string) => Decision
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
  for (const line of lines) entries.push({ name: line.name, target: targetFor(line.name, decide(line.name)) });
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
  /** The brands and list lines this product stands for; the coupons link searches the first. */
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
