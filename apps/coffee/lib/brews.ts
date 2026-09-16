/**
 * The arithmetic of a brew, kept apart from any route or component so it can
 * be tested without a database or a browser.
 */

import { DEFAULT_GRINDER } from "@/lib/brewers";

/** A refractometer reads percent. Everything else quotes ppm. They are the same number. */
export const PPM_PER_PERCENT = 10_000;

export function percentToPpm(percent: number): number {
  return Math.round(percent * PPM_PER_PERCENT);
}

export function ppmToPercent(ppm: number): number {
  // Two decimals is the resolution a refractometer actually offers; more
  // would be inventing precision the instrument does not have.
  return Math.round((ppm / PPM_PER_PERCENT) * 100) / 100;
}

/**
 * Extraction yield: the share of the dry coffee that ended up dissolved in the
 * cup.
 *
 * beverage_g is what you poured, not what you put in the kettle. The bed keeps
 * roughly two grams of water per gram of coffee, so using water-in overstates
 * the yield by about a tenth — enough to move a brew from "well extracted" to
 * "over extracted" on paper while the cup has not changed.
 */
export function extractionYield(input: {
  doseG: number | null;
  beverageG: number | null;
  tdsPercent: number | null;
}): number | null {
  const { doseG, beverageG, tdsPercent } = input;
  if (!doseG || !beverageG || !tdsPercent) return null;
  if (doseG <= 0 || beverageG <= 0 || tdsPercent <= 0) return null;
  return Math.round(((beverageG * tdsPercent) / doseG) * 100) / 100;
}

/** SCA filter targets. Outside them is a note, never a correction. */
export const TDS_TARGET = { low: 1.15, high: 1.35 } as const;
export const YIELD_TARGET = { low: 18, high: 22 } as const;

export type Band = "under" | "in" | "over";

export function band(value: number | null, target: { low: number; high: number }): Band | null {
  if (value == null) return null;
  if (value < target.low) return "under";
  if (value > target.high) return "over";
  return "in";
}

/**
 * What the two numbers mean together, in the terms that actually change what
 * you do next. Strength and extraction are different questions: a drink can be
 * strong and under-extracted at once, and the fix differs — ratio moves
 * strength, grind moves extraction.
 */
export function readBrew(input: { tdsPercent: number | null; yieldPercent: number | null }): string | null {
  const t = band(input.tdsPercent, TDS_TARGET);
  const y = band(input.yieldPercent, YIELD_TARGET);
  if (!t && !y) return null;

  const strength = t === "under" ? "weak" : t === "over" ? "strong" : "on target for strength";
  if (!y) return `Strength ${input.tdsPercent}% — ${strength}.`;

  const extraction =
    y === "under"
      ? "under-extracted, so likely sour and thin — grind finer"
      : y === "over"
        ? "over-extracted, so likely bitter and drying — grind coarser"
        : "well extracted";

  return `${strength[0].toUpperCase()}${strength.slice(1)}, and ${extraction}.`;
}

/**
 * The form for a new brew, all strings because that is what an input holds.
 */
export type BrewDraft = {
  brewer: string;
  brew_method: string;
  grinder: string;
  grind_setting: string;
  dose_g: string;
  beverage_g: string;
  notes: string;
};

/** What a brew looks like coming back from the API, in the fields worth repeating. */
type PreviousBrew = {
  brewer?: string | null;
  brew_method?: string | null;
  grinder?: string | null;
  grind_setting?: string | null;
  dose_g?: string | number | null;
};

export function blankBrew(): BrewDraft {
  return {
    brewer: "",
    brew_method: "",
    grinder: DEFAULT_GRINDER,
    grind_setting: "",
    dose_g: "",
    beverage_g: "",
    notes: "",
  };
}

/**
 * A new brew starts as a repeat of the last one on the same bag, because
 * dialling in is one change at a time against everything else held still.
 * Retyping the four settings you did not mean to change is how they drift.
 *
 * **Settings carry forward. Readings do not.** Brewer, brew method, grinder,
 * grind setting and dose are decisions — you make them again deliberately, and
 * repeating them is the point. Beverage mass, TDS, rating and notes are
 * observations of one cup. Carrying a reading forward would record a
 * measurement nobody took, and beverage mass and TDS both feed the generated
 * extraction yield, so a stale one produces a figure that is arithmetically
 * correct about a brew that never happened.
 *
 * This is the same line `findPreviousBag` draws across bags — the dial-in
 * carries, what you thought of the cup does not.
 */
export function repeatOf(previous: PreviousBrew | null | undefined): BrewDraft {
  const blank = blankBrew();
  if (!previous) return blank;

  return {
    ...blank,
    brewer: previous.brewer ?? "",
    brew_method: previous.brew_method ?? "",
    // The grinder keeps its default rather than blanking, because a previous
    // brew that recorded none says nothing about which one is on the counter.
    grinder: previous.grinder ?? blank.grinder,
    grind_setting: previous.grind_setting ?? "",
    dose_g: previous.dose_g == null ? "" : String(previous.dose_g),
  };
}
