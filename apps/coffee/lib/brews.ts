/**
 * The arithmetic of a brew, kept apart from any route or component so it can
 * be tested without a database or a browser.
 */

import { DEFAULT_GRINDER, myBrewerFor } from "@/lib/brewers";

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
 *
 * `ratio` is the one field here with no column behind it. It is water over
 * dose, so storing it would be a second home for one fact — the same reason
 * ppm is derived from the TDS reading and extraction yield is generated in
 * Postgres rather than accepted from a client. It lives in the draft because
 * a form has to hold what you typed, and it is dropped before the POST.
 *
 * `time` is the other field whose name is not its column: it holds `m:ss` as
 * typed and becomes whole seconds — `brew_seconds` — on the way out.
 */
export type BrewDraft = {
  brewer: string;
  brew_method: string;
  grinder: string;
  grind_setting: string;
  dose_g: string;
  ratio: string;
  water_g: string;
  time: string;
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
  water_g?: string | number | null;
};

/** The roaster's published numbers, as free text, exactly as they were quoted. */
export type GuideNumbers = {
  dose?: string | null;
  water?: string | null;
  ratio?: string | null;
  /** The roaster's brewer, as the `guide_method` vocabulary. Crosses to yours only via `myBrewerFor`. */
  method?: string | null;
};

export function blankBrew(): BrewDraft {
  return {
    brewer: "",
    brew_method: "",
    grinder: DEFAULT_GRINDER,
    grind_setting: "",
    dose_g: "",
    ratio: "",
    water_g: "",
    time: "",
    beverage_g: "",
    notes: "",
  };
}

/**
 * Ratio and water are two views of one decision, and the dose turns each into
 * the other: water = dose x ratio.
 *
 * **Both round to whole numbers**, on Joel's instruction of 2026-09-20:
 * *"Whole numbers only for recipe."* Water because that is what a kettle and
 * a scale resolve, and the ratio because 1:17 is what you brew to and
 * 1:16.9 is a description of what the scale happened to say. Editing one
 * field and then the other can therefore move the water by a few grams,
 * which is below the accuracy of the pour and well below anything the cup
 * can tell you.
 *
 * This rounds *your* numbers, derived from your own dose and water.
 * `parseRatio` still reports the roaster's ratio as they published it —
 * rounding that one would be inventing on their authority, which is the
 * thing this app refuses everywhere else.
 */
export function waterFor(doseG: number | null, ratio: number | null): number | null {
  if (!doseG || !ratio) return null;
  if (doseG <= 0 || ratio <= 0) return null;
  return Math.round(doseG * ratio);
}

export function ratioFor(doseG: number | null, waterG: number | null): number | null {
  if (!doseG || !waterG) return null;
  if (doseG <= 0 || waterG <= 0) return null;
  return Math.round(waterG / doseG);
}

/**
 * A brew time as the timer reads it: `m:ss`.
 *
 * Stored as whole seconds, because a duration is one number and `3:00` is a
 * way of writing it rather than a second fact about it. Two columns for one
 * measurement is the mistake ppm and extraction yield are both already
 * avoiding.
 *
 * **A bare number is refused rather than read.** "3" in a brew-time box is
 * three minutes to one person and three seconds to another, and there is
 * nothing in the string that settles it — the same shape of ambiguity
 * `lib/dates.ts` refuses in `05/06/2026`. The form says what it wants
 * instead of guessing and storing a brew nobody made.
 */
export function parseBrewTime(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = /^\s*(\d{1,3}):([0-5]\d)\s*$/.exec(text);
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]);
  return total > 0 ? total : null;
}

/** Whole seconds back into `m:ss`, for a brew that has already been logged. */
export function formatBrewTime(seconds: string | number | null | undefined): string | null {
  if (seconds == null || seconds === "") return null;
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  const whole = Math.round(n);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * A stored measurement as the form should show it.
 *
 * Postgres hands back `numeric(6,2)` with its scale intact, so an 18g dose
 * arrives as the string "18.00" and a repeated brew opened with "18.00" and
 * "306.00" in its boxes. They are the right numbers typed in a way nobody
 * types them, and the trailing zeros make a prefilled field look like
 * something already fiddled with rather than something carried over.
 */
function numText(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : String(value);
}

/**
 * A dial setting, rounded to one decimal place.
 *
 * The one grinder on the shelf — the Fellow Ode 2 — has a stepped dial in
 * tenths, so "4.5" is a real setting and "4.53" is not: the grinder cannot
 * be turned to that, and "4" hides which tenth it actually sat on. Applied
 * at save and at display, the same two points `formatBrewTime` and the
 * ratio rounding already apply at. Non-numeric text passes through
 * unchanged rather than being dropped, in case a grinder someday scores its
 * dial by name rather than by number.
 */
export function formatGrindSetting(value: string | null | undefined): string {
  if (value == null) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return trimmed;
  return n.toFixed(1);
}

/** A field as a number, or null when it is blank or not one. */
function num(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The three edits, each keeping the other two consistent.
 *
 * **The ratio is what holds when the dose changes.** That is the whole point
 * of brewing to a ratio: scaling a recipe up or down keeps the strength and
 * moves the water. Typing a water mass instead states the ratio implicitly,
 * so that direction re-derives the ratio rather than the water.
 *
 * Each returns a new draft rather than mutating, and each is a pure function
 * of what was typed, so the arithmetic is testable without a browser.
 */
export function withDose(draft: BrewDraft, value: string): BrewDraft {
  const next = { ...draft, dose_g: value };
  const dose = num(value);
  const ratio = num(draft.ratio);
  if (dose && ratio) {
    const water = waterFor(dose, ratio);
    return { ...next, water_g: water == null ? "" : String(water) };
  }
  const water = num(draft.water_g);
  if (dose && water) {
    const derived = ratioFor(dose, water);
    return { ...next, ratio: derived == null ? "" : String(derived) };
  }
  return next;
}

export function withRatio(draft: BrewDraft, value: string): BrewDraft {
  const next = { ...draft, ratio: value };
  const water = waterFor(num(draft.dose_g), num(value));
  if (water == null) return next;
  return { ...next, water_g: String(water) };
}

export function withWater(draft: BrewDraft, value: string): BrewDraft {
  const next = { ...draft, water_g: value };
  const ratio = ratioFor(num(draft.dose_g), num(value));
  if (ratio == null) return next;
  return { ...next, ratio: String(ratio) };
}

/**
 * A mass out of a roaster's own wording — "18g", "18 grams", "300 g water".
 *
 * The first number in the string wins, because roasters lead with the value
 * and trail with the qualifier. A range like "18-20g" therefore takes the
 * low end, which is the one you would start at anyway.
 *
 * A string containing a colon is refused outright: that is a ratio or a
 * brew time, and reading "1:17" as one gram of coffee is the kind of
 * confident nonsense this app exists not to produce.
 */
export function parseGrams(text: string | null | undefined): number | null {
  return gramsIn(text)[0] ?? null;
}

/**
 * The water a roaster's wording ends at — "Bloom 50g, then to 300g" is 300.
 *
 * A pour is written as its stages, and every stage is a running total on the
 * way to the last one, so the largest mass named is the water. The first one
 * is the bloom, and reading it as the recipe's water put 50g in the box.
 */
export function parseWaterGrams(text: string | null | undefined): number | null {
  const masses = gramsIn(text);
  return masses.length ? Math.max(...masses) : null;
}

/**
 * Units that are not grams and are not converted. "12 oz" is a bag size or a
 * cup, not twelve grams of anything, and converting ounces on the roaster's
 * authority is a rounding this app does not do. Millilitres pass: water is
 * weighed and a millilitre of it is a gram.
 */
const NOT_GRAMS = /^(oz|ounces?|fl|cups?|tbsps?|tablespoons?|tsps?|teaspoons?|lbs?|pounds?|kg|kilos?|l|litres?|liters?|scoops?)$/i;

/** Every mass in a string, in order, as grams. Nothing for a ratio or a time. */
function gramsIn(text: string | null | undefined): number[] {
  // A colon means a ratio or a brew time, and reading "1:17" as one gram of
  // coffee is the kind of confident nonsense this app exists not to produce.
  if (!text || text.includes(":")) return [];
  const masses: number[] = [];
  // Thousands separators are part of the number: "1,000g" is a thousand, not
  // one gram followed by some zeros.
  const pattern = /(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*([A-Za-zµ]*)/g;
  for (const match of text.matchAll(pattern)) {
    if (NOT_GRAMS.test(match[3])) continue;
    const n = Number(match[1].replace(/,/g, "") + (match[2] ?? ""));
    if (Number.isFinite(n) && n > 0) masses.push(n);
  }
  return masses;
}

/**
 * Grams of water per gram of coffee — "1:17" is 17, and so is "17:1".
 *
 * Divided rather than read off, because a roaster writing "2:30" for a brew
 * time and a roaster writing "1:17" for a ratio are indistinguishable by
 * shape. Only `guide_ratio` is ever passed here, and dividing at least keeps
 * a "60:1000" style statement correct instead of returning 1000.
 *
 * **Larger over smaller, whichever side it is written on.** Roasters write
 * "16:1" as often as "1:16", and both mean sixteen grams of water per gram of
 * coffee — a brew with less water than coffee is not a brew. Reading "16:1"
 * the other way round gave a sixteenth, and a form that then computed a
 * water mass from it.
 */
export function parseRatio(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = /(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)/.exec(text);
  if (!match) return null;
  const left = Number(match[1]);
  const right = Number(match[2]);
  if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0) return null;
  return Math.round((Math.max(left, right) / Math.min(left, right)) * 10) / 10;
}

/**
 * A new brew starts as a repeat of the last one on the same bag, because
 * dialling in is one change at a time against everything else held still.
 * Retyping the four settings you did not mean to change is how they drift.
 *
 * **Settings carry forward. Readings do not.** Brewer, brew method, grinder,
 * grind setting, dose and water are decisions — you make them again
 * deliberately, and repeating them is the point. Beverage mass, TDS, brew
 * time, rating and notes are observations of one cup. Carrying a reading
 * forward would record a measurement nobody took, and beverage mass and TDS
 * both feed the generated extraction yield, so a stale one produces a figure
 * that is arithmetically correct about a brew that never happened.
 *
 * **Brew time is a reading, and that is the whole reason it does not carry.**
 * It is tempting to read it as a target you aim at, like a ratio — but the
 * number that gets logged is what the timer said when the bed drained, and
 * repeating it would write down a stopwatch nobody started.
 *
 * This is the same line `findPreviousBag` draws across bags — the dial-in
 * carries, what you thought of the cup does not.
 */
export function repeatOf(previous: PreviousBrew | null | undefined): BrewDraft {
  const blank = blankBrew();
  if (!previous) return blank;

  const dose = numText(previous.dose_g);
  const water = numText(previous.water_g);
  const ratio = ratioFor(num(dose), num(water));

  return {
    ...blank,
    brewer: previous.brewer ?? "",
    brew_method: previous.brew_method ?? "",
    // The grinder keeps its default rather than blanking, because a previous
    // brew that recorded none says nothing about which one is on the counter.
    grinder: previous.grinder ?? blank.grinder,
    grind_setting: formatGrindSetting(previous.grind_setting),
    dose_g: dose,
    water_g: water,
    ratio: ratio == null ? "" : String(ratio),
  };
}

/**
 * What the roaster published, as a starting point for the form.
 *
 * Only the three numbers that describe the same decision the form now asks
 * for: dose, water, ratio. Grind is deliberately absent — "900µm" is a
 * particle size and the field below it is a dial position on a Fellow Ode,
 * and translating one into the other is the rounding this app refuses
 * everywhere else. Temperature has no field to land in.
 *
 * **Brew time has one now, and still does not fill from here.** The form
 * asks what the timer said, and the roaster's "2:40" is what they aim at —
 * prefilling it would put a number in the one box whose entire content is
 * what actually happened, which is the same objection as carrying a TDS
 * reading across from the last brew.
 *
 * Water is taken from their own water figure where they gave one and derived
 * from the ratio otherwise, so a roaster who publishes only "1:17" still
 * fills the form the moment you type a dose.
 */
export function fromGuide(guide: GuideNumbers | null | undefined): Partial<BrewDraft> {
  if (!guide) return {};

  const dose = parseGrams(guide.dose);
  const statedWater = parseWaterGrams(guide.water);
  const statedRatio = parseRatio(guide.ratio);

  const water = statedWater ?? waterFor(dose, statedRatio);
  const ratio = statedRatio ?? ratioFor(dose, water);

  const draft: Partial<BrewDraft> = {};
  if (dose != null) draft.dose_g = String(dose);
  if (water != null) draft.water_g = String(water);
  if (ratio != null) draft.ratio = String(ratio);
  return draft;
}

/** Where the numbers in an opened brew form came from, so the form can say. */
export type BrewSource = "repeat" | "guide" | "blank";

/**
 * The form as it opens: your last brew first, the roaster's recipe in
 * whatever it left blank.
 *
 * **Your last brew wins, field by field.** What you did on this bag is the
 * dial-in; what the roaster published is where the dial-in started. Once you
 * have brewed it once, their number is a fact about the bag rather than an
 * instruction, and overwriting your own setting with it would undo the
 * previous attempt every time you opened the form.
 *
 * Nothing here is written anywhere. These are prefilled inputs you can see
 * and change, and only pressing the button stores them — which is what keeps
 * a roaster's published number out of `coffee.brews` unless you brewed it.
 */
export function openingBrew(
  previous: PreviousBrew | null | undefined,
  guide: GuideNumbers | null | undefined,
): { draft: BrewDraft; source: BrewSource } {
  const repeated = repeatOf(previous);
  const suggested = fromGuide(guide);

  let usedGuide = false;
  const draft = { ...repeated };

  // The brewer, where the roaster's corresponds exactly to one on your shelf
  // and your last brew did not already say. `myBrewerFor` is the whole of
  // that rule: a bare "V60" or an Origami leaves it for you to choose.
  if (!draft.brewer) {
    const brewer = myBrewerFor(guide?.method);
    if (brewer) {
      draft.brewer = brewer;
      usedGuide = true;
    }
  }

  // **Dose, ratio and water are one decision, so they are filled as one.**
  // Taking each blank field from whichever source had it could open the form
  // with your dose from last time and the roaster's water — two numbers that
  // are each right and do not add up to the ratio beside them. So:
  //
  // - the dose is yours if you have one, theirs otherwise;
  // - water you poured last time stands, and the ratio follows from it;
  // - otherwise, with your dose, their *ratio* sets the water — a ratio is the
  //   part of a recipe that survives scaling, which is the reason to brew to
  //   one — and their water is used only when they gave no ratio;
  // - with their dose, their own water and ratio come with it, as published.
  const doseIsTheirs = !draft.dose_g && !!suggested.dose_g;
  if (doseIsTheirs) {
    draft.dose_g = suggested.dose_g!;
    usedGuide = true;
  }

  if (!draft.water_g) {
    const dose = num(draft.dose_g);
    const fromRatio = !doseIsTheirs && dose ? waterFor(dose, num(suggested.ratio ?? "")) : null;
    const water = fromRatio != null ? String(fromRatio) : (suggested.water_g ?? "");
    if (water) {
      draft.water_g = water;
      usedGuide = true;
    }
  }

  if (!draft.ratio) {
    // Derived from the two masses so the three fields agree — except when all
    // three are the roaster's, where their published ratio is kept as they
    // wrote it rather than re-derived from rounded grams.
    const allTheirs = doseIsTheirs && !repeated.water_g;
    const derived = ratioFor(num(draft.dose_g), num(draft.water_g));
    const ratio = allTheirs && suggested.ratio ? suggested.ratio : derived != null ? String(derived) : (suggested.ratio ?? "");
    if (ratio) {
      draft.ratio = ratio;
      if (ratio === suggested.ratio) usedGuide = true;
    }
  }

  // A form that says where its numbers came from is the same habit as showing
  // the quote beside the parsed value: a prefill you cannot account for is one
  // you brew by accident.
  const source: BrewSource = previous ? "repeat" : usedGuide ? "guide" : "blank";
  return { draft, source };
}
