import { BEST_MIN_NIGHTS, BEST_WITHIN } from "./bestPrice";
import type { Coupon } from "./couponRules";
import { couponsByProduct, productSignal, type ProductSignal, type Shade } from "./dealSignal";
import { addDays } from "./priceDates";
import type { NightRow, WeekRow } from "./priceWeeks";
import { HISTORY_WEEKS } from "./stoplight";

/**
 * What a Grocery list line says about its price (TEC-196; the owner's words of
 * 2026-10-29): the **Sale $2.99 / Coupon bubble**, the **shade**, and whether
 * it is **Best**. **Pure, and the browser runs the text helpers**, so this
 * file takes type-only imports from anything with a database behind it.
 *
 * It replaces the old tag that read the weekly deal scan (`saleTags`, TEC-121):
 * the bubble now reads the **nightly prices** (`price_nights`), the same
 * source as the line's total and as the Deals board. No Kroger call, no model.
 *
 * **A line's shade and the Deals board never disagree**: both come from
 * `productSignal` (`lib/dealSignal.ts`), and a line is read only when the
 * board would show its product (a night within `FRESH_NIGHTS` of today). A
 * line with no saved product, or no price that recent, is `null` and plain.
 * **Coupons come only from `cookbook.coupons`**; with none staged the bubble
 * says Sale alone. Colour is never the only cue: the bubble says why, and a
 * shaded line also says "Good price" or "High price".
 */

export type LineDeal = {
  shade: Shade;
  /** The stoplight's own words ("15% under its usual"), or why a new product is good. For the line's tooltip. */
  reason: string;
  /** The sale price per unit, when on sale. */
  salePrice: number | null;
  coupon: boolean;
  /** Best: at or within 5% of the 12-week nightly low, with at least 2 nights. */
  best: boolean;
  /** Priced nights behind Best, so an empty Best can say why. */
  bestNights: number;
};

/** How a signal reads on a line. */
export function lineDeal(s: ProductSignal | null): LineDeal | null {
  if (!s) return null;
  const sale = s.onSale ? "on sale" : null;
  const coupon = s.coupons > 0 ? "has a coupon" : null;
  return {
    shade: s.shade,
    reason: s.verdict.light === "new" ? [sale, coupon].filter(Boolean).join(" and ") || s.verdict.note : s.verdict.note,
    salePrice: s.salePrice,
    coupon: s.coupons > 0,
    best: s.best.qualifies,
    bestNights: s.best.nights,
  };
}

const money = (n: number) => `$${n.toFixed(2)}`;

/** "Sale $2.99", "Coupon", "Sale + coupon" (the line's own price shows the amount), or null when neither. */
export function bubbleText(d: LineDeal | null | undefined): string | null {
  if (!d) return null;
  const sale = d.salePrice !== null ? `Sale ${money(d.salePrice)}` : null;
  if (sale && d.coupon) return "Sale + coupon";
  return sale ?? (d.coupon ? "Coupon" : null);
}

/** The word that goes with a shade, so colour is never the only cue. Null when plain. */
export function shadeWord(d: LineDeal | null | undefined): string | null {
  if (!d || d.shade === "plain") return null;
  return d.shade === "good" ? "Good price" : "High price";
}

/** Why the Best toggle shows nothing: from the lines it would have filtered. */
export function bestEmptyWords(lines: (LineDeal | null | undefined)[]): { title: string; body: string } {
  if (lines.every((d) => !d || d.bestNights < BEST_MIN_NIGHTS)) {
    return {
      title: "No best deals yet",
      body: `Best needs at least ${BEST_MIN_NIGHTS} nights of prices for a product. The nightly check adds one a night, about 3 a.m. Denver time.`,
    };
  }
  return {
    title: "Nothing on the List is at its low",
    body: `Best is today's price at, or within ${Math.round(BEST_WITHIN * 100)}% of, a product's lowest night in the last ${HISTORY_WEEKS} weeks.`,
  };
}

export type LineDealInput = {
  asOf: string;
  locationId: string;
  /** Nights at the store for the last twelve weeks. */
  nights: NightRow[];
  weeks: WeekRow[];
  coupons: Coupon[];
  /** A product's night older than this many days back is not today's price (the board's `FRESH_NIGHTS`). */
  freshNights: number;
};

/** Each line's deal by id, for the lines whose saved product is known; others are null. */
export function lineDeals(lines: { id: string; productId: string | null }[], input: LineDealInput): Map<string, LineDeal | null> {
  const { asOf, locationId } = input;
  const freshFrom = addDays(asOf, -input.freshNights);

  const nightsBy = new Map<string, NightRow[]>();
  for (const n of input.nights) {
    if (n.location_id !== locationId) continue;
    nightsBy.set(n.product_id, [...(nightsBy.get(n.product_id) ?? []), n]);
  }
  const weeksBy = new Map<string, WeekRow[]>();
  for (const w of input.weeks) {
    if (w.location_id !== locationId) continue;
    weeksBy.set(w.product_id, [...(weeksBy.get(w.product_id) ?? []), w]);
  }
  const couponsBy = couponsByProduct(input.coupons, asOf);

  const out = new Map<string, LineDeal | null>();
  for (const line of lines) {
    const mine = line.productId ? (nightsBy.get(line.productId) ?? []) : [];
    // The board's rule: the newest night, and only if it is recent and not from the future.
    const latest = mine.filter((n) => n.night >= freshFrom && n.night <= asOf).sort((a, b) => b.night.localeCompare(a.night))[0];
    out.set(
      line.id,
      latest && line.productId
        ? lineDeal(
            productSignal({
              regular: latest.regular,
              sale: latest.sale,
              coupons: (couponsBy.get(line.productId) ?? []).length,
              weeks: weeksBy.get(line.productId) ?? [],
              nights: mine,
              asOf,
            })
          )
        : null
    );
  }
  return out;
}
