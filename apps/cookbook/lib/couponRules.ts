import { addDays } from "./priceDates";

/**
 * What a staged coupon is, and when it counts (TEC-132). No database import,
 * so the Deals logic and its tests can use it; `lib/couponStore.ts` reads the
 * table.
 */

export type Coupon = {
  id: string;
  title: string;
  /** The offer as shown, "$1 off 2". Text; nothing computes on it. */
  amount: string;
  expires_on: string | null;
  /** The Monday of the week the Chrome task saw it. */
  week_seen: string;
  /** The King Soopers codes it lists as qualifying; may be empty. */
  product_ids: string[];
};

/** A coupon with no expiry stays active this long from the week it was seen. */
export const NO_EXPIRY_ACTIVE_DAYS = 14;

/** Active on `asOf` (a Denver date): not expired, or, with no expiry, seen recently. */
export function couponActive(c: Pick<Coupon, "expires_on" | "week_seen">, asOf: string): boolean {
  if (c.expires_on) return c.expires_on >= asOf;
  return addDays(c.week_seen, NO_EXPIRY_ACTIVE_DAYS) > asOf;
}
