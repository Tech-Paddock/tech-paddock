import { addDays } from "./priceDates";

/**
 * The Deals stoplight (TEC-132): is today's price good, bad or ordinary for
 * **this product**, measured against its own last twelve weeks. **One pure
 * function, no imports beyond date arithmetic**, so the tests hold its edges
 * and the browser can run it.
 *
 * - **green**: at or below the 12-week low, or at least 15% under the mean;
 * - **red**: at least 10% over the mean, even when Kroger calls it a sale;
 * - **neutral**: anything else, which shows no colour;
 * - **new**: under four weeks of history, which says "new: building history"
 *   and is never coloured, however the price looks.
 *
 * **The thresholds are named constants because TEC-138 reviews them in a
 * month** (2026-11-24): change a number here and nowhere else.
 *
 * The mean is over **nights**, not weeks: each week's mean counts as many times
 * as it had nights seen, so a week with four nights does not weigh as much as
 * a full one. The low is the lowest weekly low.
 *
 * **A product whose price never moves reads green**, because its price is
 * always at its own 12-week low. That follows the rule as written; whether
 * it should is a TEC-138 question.
 */

/** Green: this fraction under the mean or more. */
export const GREEN_UNDER_MEAN = 0.15;
/** Red: this fraction over the mean or more. */
export const RED_OVER_MEAN = 0.1;
/** Fewer weeks than this and there is not enough history to colour anything. */
export const MIN_WEEKS = 4;
/** How far back history reaches. */
export const HISTORY_WEEKS = 12;
/** What the "new" state says. */
export const NEW_LABEL = "new: building history";

export type WeekStat = {
  /** The Monday. */
  week_start: string;
  low: number;
  mean: number;
  nights_seen: number;
};

export type Light = "green" | "neutral" | "red" | "new";

export type Verdict = {
  light: Light;
  /** Weeks of history used, 0 to 12. */
  weeks: number;
  /** The 12-week low and the night-weighted mean; null when there was no history. */
  low: number | null;
  mean: number | null;
  /** Today against the mean, signed: -0.2 is 20% under. Null when there was no history. */
  versusMean: number | null;
  /** A short reason, for the row. Always says "new: building history" for `new`. */
  note: string;
};

/** The weeks that count: inside the twelve before `asOf`, and not from the future. */
export function weeksInWindow<T extends WeekStat>(weeks: T[], asOf: string): T[] {
  const from = addDays(asOf, -7 * HISTORY_WEEKS);
  return weeks.filter((w) => w.week_start >= from && w.week_start <= asOf);
}

const money = (n: number) => `$${n.toFixed(2)}`;
const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;

// A float guard, not a tolerance in the rule: 5 * 0.85 is 4.249999999999999.
const EPS = 1e-9;

/**
 * Today's price against that product's weeks. `today` is the effective price
 * (the sale if there is one, else the regular); `asOf` is today's Denver date.
 */
export function stoplight(today: number, weeks: WeekStat[], asOf: string): Verdict {
  const used = weeksInWindow(weeks, asOf);
  if (used.length < MIN_WEEKS) {
    return { light: "new", weeks: used.length, low: null, mean: null, versusMean: null, note: NEW_LABEL };
  }

  const low = Math.min(...used.map((w) => w.low));
  const nights = used.reduce((n, w) => n + w.nights_seen, 0);
  const mean = used.reduce((sum, w) => sum + w.mean * w.nights_seen, 0) / nights;
  const versusMean = (today - mean) / mean;
  const base = { weeks: used.length, low, mean, versusMean };

  if (today <= low + EPS) {
    return { ...base, light: "green", note: `at its ${used.length}-week low of ${money(low)}` };
  }
  if (today <= mean * (1 - GREEN_UNDER_MEAN) + EPS) {
    return { ...base, light: "green", note: `${pct(versusMean)} under its usual` };
  }
  if (today >= mean * (1 + RED_OVER_MEAN) - EPS) {
    return { ...base, light: "red", note: `${pct(versusMean)} over its usual` };
  }
  if (Math.abs(versusMean) < 0.005) return { ...base, light: "neutral", note: "about its usual" };
  return { ...base, light: "neutral", note: `${pct(versusMean)} ${versusMean < 0 ? "under" : "over"} its usual` };
}
