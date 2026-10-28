import { localToday, menuDayLabel, parseDay } from "./menuDay";

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
/* Add to list: the day chips                                              */
/* ---------------------------------------------------------------------- */

export type DayChip = { key: string; label: string; day: string };

/** `day` moved by `by` calendar days. Built at local noon, so no zone edge moves it. */
function shiftDay(day: string, by: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return localToday(new Date(y, m - 1, d + by, 12));
}

function weekdayName(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString("en-US", { weekday: "long" });
}

/**
 * Today, Tomorrow, then the next three days by name ("Thursday"). The three
 * follow tomorrow, so no name repeats Today or Tomorrow. "Pick a date…" is not
 * here: it opens the date input and is the card's own chip.
 */
export function dayChips(today: string = localToday()): DayChip[] {
  const base = parseDay(today) ?? localToday();
  return [
    { key: "today", label: "Today", day: base },
    { key: "tomorrow", label: "Tomorrow", day: shiftDay(base, 1) },
    ...[2, 3, 4].map((n) => {
      const day = shiftDay(base, n);
      return { key: day, label: weekdayName(day), day };
    }),
  ];
}

/** The card's one button, naming the day: "Add to Thursday's list". */
export function addButtonLabel(day: string, today: string = localToday()): string {
  const chip = dayChips(today).find((c) => c.day === day);
  if (!chip) return `Add to the list for ${menuDayLabel(day)}`;
  if (chip.key === "today") return "Add to today's list";
  if (chip.key === "tomorrow") return "Add to tomorrow's list";
  return `Add to ${chip.label}'s list`;
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
