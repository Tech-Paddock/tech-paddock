// Brew method is a fixed vocabulary, not free text. "V60", "v60" and
// "Hario V60" as three distinct values would quietly break grouping and
// filtering in the library, and the roaster's own wording varies more than
// that. A lookup table carrying your standard technique per method is the
// obvious next step and deliberately isn't built yet — promoting this enum
// to a table later is an additive migration.

export const BREW_METHODS = [
  "v60",
  "chemex",
  "kalita",
  "aeropress",
  "french-press",
  "espresso",
  "moka",
  "cold-brew",
  "batch",
  "other",
] as const;

export type BrewMethod = (typeof BREW_METHODS)[number];

export const METHOD_LABELS: Record<BrewMethod, string> = {
  v60: "V60",
  chemex: "Chemex",
  kalita: "Kalita Wave",
  aeropress: "AeroPress",
  "french-press": "French press",
  espresso: "Espresso",
  moka: "Moka pot",
  "cold-brew": "Cold brew",
  batch: "Batch brew",
  other: "Other",
};

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
  [/\bv-?60\b|\bhario\b|\bcone\b/i, "v60"],
  [/\bespresso\b|\bportafilter\b|\bbasket\b/i, "espresso"],
  [/\bbatch\b|\bauto-?drip\b|\bbrewer\b|\bmachine\b/i, "batch"],
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
