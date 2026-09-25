import { ROASTER_BREWERS, ROASTER_BREWER_LABELS, type RoasterBrewer } from "./brewers";

// Brew method is a fixed vocabulary, not free text. "V60", "v60" and
// "Hario V60" as three distinct values would quietly break grouping and
// filtering in the library, and the roaster's own wording varies more than
// that. A lookup table carrying your standard technique per method is the
// obvious next step and deliberately isn't built yet — promoting this enum
// to a table later is an additive migration.

// The roaster-facing vocabulary now lives in brewers.ts alongside yours, so
// the two lists sit next to each other and the reason they differ is written
// down once. These re-exports keep the existing names working.
export const BREW_METHODS = ROASTER_BREWERS;

export type BrewMethod = RoasterBrewer;

export const METHOD_LABELS = ROASTER_BREWER_LABELS;

export function isBrewMethod(value: unknown): value is BrewMethod {
  return typeof value === "string" && (BREW_METHODS as readonly string[]).includes(value);
}

// Roasters write "Hario V60", "pourover", "Pour Over", "filter". Map what
// they wrote onto the vocabulary. Ordered longest-phrase-first so "french
// press" isn't swallowed by "press", and checked against the raw source
// text rather than a model-chosen label, so the normalization is auditable
// against the stored quote.
const ALIASES: [RegExp, BrewMethod][] = [
  [/\bfrench\s*press\b|\bcafeti[eè]re\b|\bplunger\b/i, "french-press"],
  [/\bcold\s*brew\b|\btoddy\b/i, "cold-brew"],
  [/\bmoka\b|\bstovetop\b/i, "moka"],
  [/\baeropress\b/i, "aeropress"],
  [/\bkalita\b|\bwave\s*185\b|\bflat\s*bottom\b/i, "kalita"],
  [/\bchemex\b/i, "chemex"],
  // Sweet Bloom publishes "ORIGAMI AIR". Every bag in the library hit this and
  // was correctly recorded as "other" — unplaceable, not guessed at. It is
  // placeable now.
  [/\borigami\b/i, "origami"],
  [/\bv-?60\b|\bhario\b|\bcone\b/i, "v60"],
  [/\bespresso\b|\bportafilter\b|\bbasket\b/i, "espresso"],
  // Named batch brewing only. "brewer" and "machine" used to land here too,
  // so "any pour-over brewer" became Batch — a word every method shares,
  // read as the one method it names least.
  [/\bbatch\b|\bauto-?drip\b/i, "batch"],
  // Wording that declines to name a brewer — "any pour-over brewer", "a drip
  // coffee maker", "whatever you have" — is something said and unplaceable,
  // which is what "other" means. It sits before the generic fallback because
  // the fallback would otherwise round it to a V60 on the roaster's behalf.
  [/\bany\b|\bwhatever\b|\bcoffee\s*maker\b|\bmachine\b/i, "other"],
  // Generic filter language last: it only wins if nothing specific matched.
  [/\bpour\s*-?\s*over\b|\bpourover\b|\bfilter\b|\bdrip\b/i, "v60"],
];

/**
 * Normalize a roaster's method wording onto the vocabulary. Returns "other"
 * for text that names no recognizable method, and null for nothing at all —
 * the caller distinguishes "they said something we couldn't place" from
 * "they said nothing", because only the first is worth storing.
 */
export function normalizeMethod(text: string | null | undefined): BrewMethod | null {
  if (!text || !text.trim()) return null;
  for (const [pattern, method] of ALIASES) {
    if (pattern.test(text)) return method;
  }
  return "other";
}
