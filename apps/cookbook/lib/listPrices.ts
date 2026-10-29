import type { NightRow } from "./priceWeeks";
import type { Decision } from "./brands";

/**
 * What the Grocery list's totals are made of (TEC-190; `RULES.md`, *Storage*
 * and *Deals*). **Pure, and the browser runs it**, so this file takes type-only
 * imports.
 *
 * The list no longer asks Kroger for a live estimate. Each line is priced from
 * **its saved product's latest nightly price** (`price_nights`, written by the
 * nightly cron): the sale price on a night the product was on sale, else the
 * regular. **A line with no saved product, or no recent price for it, is "no
 * price yet", never $0**, and the total says how many. Two totals are shown,
 * for List and for In cart, labelled with the night the prices are from.
 *
 * The product a line is priced as is the one Send would put in without asking:
 * the only saved product, the name's default or the one the line names (the
 * first candidate), or the single product found by its Kroger name. A line with
 * several candidates and no default (Pick one) is not guessed; it is "no price
 * yet" until a pick is made. No model runs.
 */

/** How many nights back a product's latest price may be from and still count. */
export const PRICE_WINDOW_NIGHTS = 5;

/** The product code a line is priced as, or null when none is certain. */
export function productFor(decision: Decision): string | null {
  if (decision?.kind !== "products") return null;
  const [first] = decision.candidates;
  if (!first) return null;
  if (decision.via === "description") return decision.candidates.length === 1 ? first.upc : null;
  if (decision.candidates.length === 1 || decision.chosen) return first.upc;
  return null;
}

/** A night's price: the sale on a night it was below the regular, else the regular. */
export function nightPrice(n: Pick<NightRow, "regular" | "sale">): { price: number; onSale: boolean } | null {
  const onSale = n.sale !== null && (n.regular === null || n.sale < n.regular);
  const price = onSale ? n.sale : (n.regular ?? n.sale);
  return price === null ? null : { price, onSale };
}

/** Each product's newest night at the store. */
export function latestNights(nights: NightRow[], locationId: string): Map<string, NightRow> {
  const latest = new Map<string, NightRow>();
  for (const n of nights) {
    if (n.location_id !== locationId) continue;
    const seen = latest.get(n.product_id);
    if (!seen || n.night > seen.night) latest.set(n.product_id, n);
  }
  return latest;
}

export type LinePrice = {
  /** One unit's price. */
  unit: number;
  /** Unit × the line's quantity, in cents-exact dollars. */
  total: number;
  onSale: boolean;
  /** The night this price is from. */
  night: string;
};

/** Each line's price by id; null for a line with no certain product or no recent price. */
export function priceLines(
  lines: { id: string; quantity: number; productId: string | null }[],
  latest: Map<string, NightRow>
): Map<string, LinePrice | null> {
  const out = new Map<string, LinePrice | null>();
  for (const line of lines) {
    const night = line.productId ? latest.get(line.productId) : undefined;
    const priced = night ? nightPrice(night) : null;
    out.set(
      line.id,
      night && priced
        ? { unit: priced.price, total: Math.round(priced.price * 100) * line.quantity / 100, onSale: priced.onSale, night: night.night }
        : null
    );
  }
  return out;
}

export type Totals = {
  /** Null when no line could be priced: "no price yet", never $0. */
  total: number | null;
  priced: number;
  unpriced: number;
  /** The oldest and newest night the priced lines' prices are from. */
  from: string | null;
  to: string | null;
};

/** A section's total from its lines' prices. */
export function totalsOf(prices: (LinePrice | null | undefined)[]): Totals {
  const priced = prices.filter((p): p is LinePrice => !!p);
  const nights = priced.map((p) => p.night).sort();
  return {
    total: priced.length === 0 ? null : priced.reduce((sum, p) => sum + Math.round(p.total * 100), 0) / 100,
    priced: priced.length,
    unpriced: prices.length - priced.length,
    from: nights[0] ?? null,
    to: nights[nights.length - 1] ?? null,
  };
}
