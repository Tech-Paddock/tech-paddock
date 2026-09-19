/**
 * Meal slots, and the clock's opinion about which one you are in.
 *
 * Dictation rarely says when. The plan's answer is that the timestamp defaults
 * to now and Claude infers the slot from the clock and the content — so this
 * file is the clock half, used as the prompt's starting point and as the
 * fallback when the model declines to choose.
 */

export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;

export type Meal = (typeof MEALS)[number];

export function isMeal(value: unknown): value is Meal {
  return typeof value === "string" && (MEALS as readonly string[]).includes(value);
}

/**
 * The slot a given local hour falls in. Boundaries are deliberately generous
 * and the model can override them from the content — "I had a bagel for
 * breakfast" said at two in the afternoon is breakfast, and the words win over
 * the clock.
 */
export function mealForHour(hour: number): Meal {
  if (hour >= 4 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 16) return "lunch";
  if (hour >= 16 && hour < 22) return "dinner";
  return "snack";
}

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

/** `YYYY-MM-DD` for a Date, in the viewer's own timezone rather than UTC. */
export function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
