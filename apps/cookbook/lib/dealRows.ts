import { pageFor } from "./kingsoopers";
import { addDays } from "./priceDates";
import { percentOff } from "./pricing";
import type { Coupon } from "./couponRules";
import type { Best } from "./bestPrice";
import { couponsByProduct, productSignal, type Shade } from "./dealSignal";
import type { NightRow, WeekRow } from "./priceWeeks";
import { weeksInWindow, type Light } from "./stoplight";
import type { SavedProduct } from "./brands";

/**
 * What the Deals tab shows (TEC-132), built from rows already read: **pure**,
 * so the tests hold it without a database or Kroger. `lib/dealBoard.ts` reads
 * and calls this.
 *
 * **Every saved product with a recent price is a row**, coloured by the
 * stoplight (`lib/stoplight.ts`), with its usual price, an 8-week trend, and
 * any active coupon that lists its code. A **stack** is a product with both a
 * sale and a coupon. Coupons match by product code, never by name.
 *
 * **Today's price** is the product's latest nightly row from the last
 * `FRESH_NIGHTS` nights; an older one is not today's price and the product is
 * counted as unpriced instead. **For any product with no fresh night**, the
 * latest deal scan (`deal_scans`, the list tab's) fills in the ones it found on
 * sale, at the same store, so the tab is not empty before the nightly run has
 * reached them. Its colour is from whatever weeks it has, so a product with too
 * few reads "new: building history".
 */

/** A night this old or older is not today's price. */
export const FRESH_NIGHTS = 3;
/** The trend shows this many weekly means. */
export const TREND_WEEKS = 8;
/** What an aisle-less product is grouped under. */
export const NO_AISLE = "Other";

export type DealRow = {
  productId: string;
  name: string;
  /** The names the product is saved under (Your brands), for matching list lines. */
  names: string[];
  size: string | null;
  url: string;
  aisle: string;
  /** How many times it has gone in the cart (Your brands' count). */
  bought: number;
  /** Today's effective price: the sale if there is one, else the regular. */
  now: number;
  /** The regular price over the last twelve weeks, or today's when there is no history. */
  usual: number;
  onSale: boolean;
  percentOff: number | null;
  inStock: boolean | null;
  /** The night (or scan day) the price is from. */
  priceDate: string;
  source: "nightly" | "scan";
  light: Light;
  /** The stoplight's reason, or "new: building history". */
  note: string;
  weeks: number;
  /** Up to eight weekly means, oldest first. */
  trend: number[];
  coupons: { title: string; amount: string; expires_on: string | null }[];
  /** On sale and with a coupon. */
  stacks: boolean;
  /** How a Grocery list line for this product is shaded (`lib/dealSignal.ts`, shared). */
  shade: Shade;
  /** Within 5% of the 12-week nightly low (`lib/bestPrice.ts`, shared with the list). */
  best: Best;
};

export type DealBoard = {
  store: string | null;
  /** Today's Denver date. */
  asOf: string;
  rows: DealRow[];
  /** Whether any coupon has ever been staged; false says "no coupons staged yet". */
  couponsStaged: boolean;
  /** Saved products with no recent price. */
  unpriced: number;
  /** Whether the nightly scan has recorded anything yet at this store. */
  hasNights: boolean;
  /** When the nightly check first and last recorded prices at this store (TEC-190); null before the first. */
  lastRun: { first: string; last: string; recordedAt: string | null } | null;
  /** The most weeks of history any priced product has (the stoplight needs `MIN_WEEKS`). */
  weeksHeld: number;
  /** The most priced nights any product has in the last 12 weeks (Best needs `BEST_MIN_NIGHTS`). */
  nightsHeld: number;
};

export type ScanDeals = {
  /** The Denver date the scan ran. */
  ranOn: string;
  locationId: string;
  deals: { productId: string; regular: number; promo: number }[];
};

export type BoardInput = {
  asOf: string;
  store: { locationId: string; name: string } | null;
  products: SavedProduct[];
  nights: NightRow[];
  weeks: WeekRow[];
  coupons: Coupon[];
  couponsStaged: boolean;
  scan: ScanDeals | null;
  /** The nightly check's first and last night at the store (`readNightSpan`); optional so older callers still compile. */
  span?: { first: string; last: string; recordedAt: string | null } | null;
};

const weighted = (parts: { value: number; weight: number }[]): number | null => {
  const total = parts.reduce((n, p) => n + p.weight, 0);
  return total === 0 ? null : parts.reduce((s, p) => s + p.value * p.weight, 0) / total;
};

export function buildDealBoard(input: BoardInput): DealBoard {
  const { asOf, store, products } = input;
  const empty: DealBoard = { store: store?.name ?? null, asOf, rows: [], couponsStaged: input.couponsStaged, unpriced: 0, hasNights: false, lastRun: input.span ?? null, weeksHeld: 0, nightsHeld: 0 };
  if (!store) return empty;

  const freshFrom = addDays(asOf, -FRESH_NIGHTS);
  const latest = new Map<string, NightRow>();
  for (const n of input.nights) {
    if (n.location_id !== store.locationId || n.night < freshFrom || n.night > asOf) continue;
    const seen = latest.get(n.product_id);
    if (!seen || n.night > seen.night) latest.set(n.product_id, n);
  }

  const scan = input.scan && input.scan.locationId === store.locationId && input.scan.ranOn >= freshFrom ? input.scan : null;
  const scanned = new Map((scan?.deals ?? []).map((d) => [d.productId, d] as const));

  const weeksBy = new Map<string, WeekRow[]>();
  for (const w of input.weeks) {
    if (w.location_id !== store.locationId) continue;
    weeksBy.set(w.product_id, [...(weeksBy.get(w.product_id) ?? []), w]);
  }

  // Every night at the store, for Best (twelve weeks of them; the stoplight reads the weeks).
  const nightsBy = new Map<string, NightRow[]>();
  for (const n of input.nights) {
    if (n.location_id !== store.locationId) continue;
    nightsBy.set(n.product_id, [...(nightsBy.get(n.product_id) ?? []), n]);
  }

  const couponsBy = couponsByProduct(input.coupons, asOf);

  const rows: DealRow[] = [];
  let unpriced = 0;
  for (const p of products) {
    const night = latest.get(p.product_id);
    const deal = scanned.get(p.product_id);
    let regular: number | null;
    let sale: number | null;
    let inStock: boolean | null;
    let aisle: string | null;
    let priceDate: string;
    let source: DealRow["source"];
    if (night) {
      ({ regular, sale, in_stock: inStock, aisle } = night);
      priceDate = night.night;
      source = "nightly";
    } else if (deal && scan) {
      regular = deal.regular;
      sale = deal.promo;
      inStock = null;
      aisle = null;
      priceDate = scan.ranOn;
      source = "scan";
    } else {
      unpriced += 1;
      continue;
    }

    const history = weeksInWindow(weeksBy.get(p.product_id) ?? [], asOf);
    const coupons = (couponsBy.get(p.product_id) ?? []).map((c) => ({ title: c.title, amount: c.amount, expires_on: c.expires_on }));
    // **The one function a list line asks too** (TEC-196), so the two agree.
    const signal = productSignal({ regular, sale, coupons: coupons.length, weeks: history, nights: nightsBy.get(p.product_id) ?? [], asOf });
    if (signal === null) {
      unpriced += 1;
      continue;
    }
    const { now, verdict, onSale } = signal;
    const usual = weighted(history.flatMap((w) => (w.regular_mean === null ? [] : [{ value: w.regular_mean, weight: w.nights_seen }])));
    const off = regular !== null && sale !== null ? percentOff({ regular, promo: sale }) : null;

    rows.push({
      productId: p.product_id,
      name: p.description ?? p.names[0] ?? p.product_id,
      names: p.names,
      size: p.size ?? p.size_first,
      url: p.url ?? pageFor(p.product_id, p.names[0] ?? ""),
      aisle: aisle ?? NO_AISLE,
      bought: p.count,
      now,
      usual: Math.round((usual ?? regular ?? now) * 100) / 100,
      onSale,
      percentOff: off,
      inStock,
      priceDate,
      source,
      light: verdict.light,
      note: verdict.note,
      weeks: verdict.weeks,
      trend: [...history]
        .sort((a, b) => a.week_start.localeCompare(b.week_start))
        .slice(-TREND_WEEKS)
        .map((w) => w.mean),
      coupons,
      stacks: onSale && coupons.length > 0,
      shade: signal.shade,
      best: signal.best,
    });
  }

  rows.sort((a, b) => a.aisle.localeCompare(b.aisle) || b.bought - a.bought || a.name.localeCompare(b.name));
  return {
    ...empty,
    rows,
    unpriced,
    hasNights: input.nights.some((n) => n.location_id === store.locationId),
    weeksHeld: rows.reduce((most, r) => Math.max(most, r.weeks), 0),
    nightsHeld: rows.reduce((most, r) => Math.max(most, r.best.nights), 0),
  };
}
