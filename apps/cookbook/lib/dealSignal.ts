import { bestPrice, type Best } from "./bestPrice";
import { couponActive, type Coupon } from "./couponRules";
import { effectivePrice, nightOnSale, type NightPrice } from "./priceWeeks";
import { stoplight, weeksInWindow, type Light, type Verdict, type WeekStat } from "./stoplight";

/**
 * What one product's price means today (TEC-196): the stoplight, whether it is
 * on sale, whether a staged coupon matches, how that shades a Grocery list
 * line, and whether it is Best. **The one place both screens ask**: the Deals
 * board (`lib/dealRows.ts`) and the list's lines (`app/api/grocery/route.ts`)
 * both call `productSignal`, so a line's shade and the board's colour cannot
 * disagree for the same product. Pure.
 *
 * **The shade** (owner, 2026-10-29):
 * - with four or more weeks of history, `green` is good, `red` is bad and
 *   anything else is plain;
 * - before that (`new`), **on sale or with a coupon is good**, else plain.
 *   Never bad without history.
 */

export type Shade = "good" | "bad" | "plain";

/** The shade for a light, a sale and a coupon. */
export function shadeOf(light: Light, onSale: boolean, coupons: number): Shade {
  if (light === "green") return "good";
  if (light === "red") return "bad";
  if (light === "new" && (onSale || coupons > 0)) return "good";
  return "plain";
}

export type ProductSignal = {
  /** Today's effective price. */
  now: number;
  /** The sale price when on sale, else null. */
  salePrice: number | null;
  onSale: boolean;
  /** Active staged coupons that list the product's code. */
  coupons: number;
  verdict: Verdict;
  shade: Shade;
  best: Best;
};

export type SignalInput = {
  regular: number | null;
  sale: number | null;
  coupons: number;
  /** The product's rolled-up weeks at the store; the stoplight keeps those inside twelve. */
  weeks: WeekStat[];
  /** The product's nightly rows at the store; Best keeps those inside twelve weeks. */
  nights: Pick<NightPrice, "night" | "regular" | "sale">[];
  /** Today's Denver date. */
  asOf: string;
};

/** Null when the night has no price: nothing to say, so the line stays plain. */
export function productSignal(i: SignalInput): ProductSignal | null {
  const now = effectivePrice(i);
  if (now === null) return null;
  const onSale = nightOnSale(i);
  const verdict = stoplight(now, weeksInWindow(i.weeks, i.asOf), i.asOf);
  return {
    now,
    salePrice: onSale ? i.sale : null,
    onSale,
    coupons: i.coupons,
    verdict,
    shade: shadeOf(verdict.light, onSale, i.coupons),
    best: bestPrice(now, i.nights, i.asOf),
  };
}

/** Active staged coupons by product code (a coupon matches by code, never by name). */
export function couponsByProduct(coupons: Coupon[], asOf: string): Map<string, Coupon[]> {
  const by = new Map<string, Coupon[]>();
  for (const c of coupons) {
    if (!couponActive(c, asOf)) continue;
    for (const code of new Set(c.product_ids)) by.set(code, [...(by.get(code) ?? []), c]);
  }
  return by;
}
