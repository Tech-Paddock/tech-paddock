import { addDays } from "./priceDates";
import { effectivePrice, type NightPrice } from "./priceWeeks";
import { HISTORY_WEEKS } from "./stoplight";

/**
 * "Best" (TEC-196): is tonight's price at, or within 5% of, this product's
 * lowest nightly price in the last twelve weeks? **One pure function**, shared
 * by the Deals board (`lib/dealRows.ts`) and the Grocery list's lines
 * (`lib/dealSignal.ts`), so the two can never disagree about the same product.
 * Type-only imports beyond date arithmetic; the browser runs it.
 *
 * - The window is the `HISTORY_WEEKS` before `asOf`, inclusive, whatever
 *   history exists inside it.
 * - **At least `BEST_MIN_NIGHTS` nights are needed.** One night of history is
 *   its own low, so it would qualify trivially; that says nothing.
 * - A night's price is the effective price (the sale if there is one, else the
 *   regular), the same one the stoplight and the totals use.
 * - Named constants, because the owner picked 5% and may move it (TEC-138).
 */

/** Best: at most this fraction over the 12-week low. */
export const BEST_WITHIN = 0.05;
/** Fewer priced nights than this and Best says nothing. */
export const BEST_MIN_NIGHTS = 2;

export type Best = {
  qualifies: boolean;
  /** The lowest nightly price in the window; null when there was no priced night. */
  low: number | null;
  /** Priced nights inside the window. */
  nights: number;
  /** Why: `best`, `above` the low by more than the margin, or `few-nights`. */
  why: "best" | "above" | "few-nights";
};

// A float guard, not a tolerance in the rule: 4 * 1.05 is 4.2 and 4.2000000000000002.
const EPS = 1e-9;

export function bestPrice(now: number, nights: Pick<NightPrice, "night" | "regular" | "sale">[], asOf: string): Best {
  const from = addDays(asOf, -7 * HISTORY_WEEKS);
  const prices = nights
    .filter((n) => n.night >= from && n.night <= asOf)
    .flatMap((n) => {
      const p = effectivePrice(n);
      return p === null ? [] : [p];
    });
  if (prices.length < BEST_MIN_NIGHTS) {
    return { qualifies: false, low: prices.length === 0 ? null : Math.min(...prices), nights: prices.length, why: "few-nights" };
  }
  const low = Math.min(...prices);
  const qualifies = now <= low * (1 + BEST_WITHIN) + EPS;
  return { qualifies, low, nights: prices.length, why: qualifies ? "best" : "above" };
}
