import { timeParts } from "./metadata";
import { round, type Macros } from "./macros";

/**
 * What the book's recipe pill and the open recipe say (TEC-183). Pure, so the
 * browser and the tests both import it.
 */

/** The pill's rating: "5★", the number then one star. Nothing when unrated. */
export function ratingPill(rating: number | null | undefined): string | null {
  if (!rating || rating < 1 || rating > 5) return null;
  return `${Math.round(rating)}★`;
}

/** The open recipe's line under the rating: "N of 5", or "Not rated". */
export function ratingWords(rating: number | null | undefined): string {
  return ratingPill(rating) ? `${Math.round(rating as number)} of 5` : "Not rated";
}

/** The open recipe's tabs, in order. It opens on the first. */
export const RECIPE_TABS = [
  { key: "ingredients", label: "Ingredients" },
  { key: "method", label: "Method" },
  { key: "macros", label: "Macros" },
] as const;

export type RecipeTab = (typeof RECIPE_TABS)[number]["key"];

export const FIRST_RECIPE_TAB: RecipeTab = RECIPE_TABS[0].key;

/* ---------------------------------------------------------------------- */
/* The list line and the open recipe's facts (TEC-189)                      */
/* ---------------------------------------------------------------------- */

/**
 * The second line of a recipe on the list: rating, Prep, Cook, makes N, each
 * part absent when unset ("5★ · Prep 15m · Cook 30m · makes 4"). The old total
 * stands in for Prep and Cook only while neither is set. `stars` is split out so
 * the rating can be drawn in the accent.
 */
export function factsLine(r: {
  rating: number | null;
  servings: number;
  total_minutes: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
}): { stars: string | null; rest: string } {
  return {
    stars: ratingPill(r.rating),
    rest: [...timeParts(r), `makes ${r.servings}`].join(" · "),
  };
}

/** The third line: one serving's numbers as text, "520 kcal · 38p · 42c · 18f". */
export function macrosLine(m: Macros): string {
  const r = round(m);
  return `${r.kcal} kcal · ${r.protein_g}p · ${r.carbs_g}c · ${r.fat_g}f`;
}

/* ---------------------------------------------------------------------- */
/* Ingredients: the amount in its own column                               */
/* ---------------------------------------------------------------------- */

const VULGAR = "\\u00BC-\\u00BE\\u2150-\\u215E";
const NUM = `(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?[${VULGAR}]?|[${VULGAR}])`;
const RANGE = `${NUM}(?:\\s*(?:-|–|to)\\s*${NUM})?`;
const UNITS = [
  "tsp", "teaspoons?", "tbsp", "tablespoons?", "cups?", "oz", "ounces?", "lbs?", "pounds?",
  "g", "grams?", "kg", "ml", "l", "litres?", "liters?", "cloves?", "cans?", "tins?", "pinch(?:es)?",
  "dash(?:es)?", "slices?", "sprigs?", "bunch(?:es)?", "stalks?", "pieces?", "packages?", "pkgs?",
  "sticks?", "heads?",
];
const AMOUNT = new RegExp(
  `^\\s*(${RANGE}(?:\\s*(?:${UNITS.join("|")})\\.?(?=\\s))?)\\s+(\\S.*)$`,
  "i",
);
// "200g flour": a unit written straight after the number.
const GLUED = new RegExp(`^\\s*(${RANGE}(?:${UNITS.join("|")}))\\.?\\s+(\\S.*)$`, "i");

/**
 * An ingredient line split into its amount and the rest, where the text leads
 * with an amount ("2 tbsp olive oil" → "2 tbsp" · "olive oil"). A line that does
 * not lead with one ("Salt, to taste") comes back whole with `amount: null`.
 */
export function splitIngredient(line: string): { amount: string | null; text: string } {
  const m = AMOUNT.exec(line) ?? GLUED.exec(line);
  if (!m) return { amount: null, text: line };
  return { amount: m[1].trim(), text: m[2].trim() };
}
