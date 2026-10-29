import { round, scale, type Macros } from "./macros";

/**
 * The open recipe's **Macro breakdown** (TEC-140): the whole pot beside one
 * serving, and the share of calories from protein, carbs and fat. Arithmetic on
 * stored numbers only — no model, no request, nothing written — so the browser
 * runs it. Kept apart from React so the tests can hold the numbers.
 */

/** kcal per gram, the Atwater general factors. */
export const KCAL_PER_GRAM = { protein_g: 4, carbs_g: 4, fat_g: 9 } as const;

export type SplitKey = keyof typeof KCAL_PER_GRAM;
export const SPLIT_KEYS: readonly SplitKey[] = ["protein_g", "carbs_g", "fat_g"];

/**
 * The pot and one serving, rounded for display. A recipe stores the pot; the
 * serving is the pot over `servings` (a nonsense count reads as 1, as
 * `perServing` does), so the two always agree before rounding.
 */
export function potAndServing(recipe: Macros & { servings: number }): { pot: Macros; serving: Macros } {
  const n = recipe.servings > 0 ? recipe.servings : 1;
  const pot: Macros = { kcal: recipe.kcal, protein_g: recipe.protein_g, carbs_g: recipe.carbs_g, fat_g: recipe.fat_g };
  return { pot: round(pot), serving: round(scale(pot, 1 / n)) };
}

/**
 * **The share of calories from each, as whole percents that add to 100.**
 *
 * The denominator is the three macros' own calories at 4/4/9, not the stored
 * kcal: an estimate's kcal is its own figure (fibre, alcohol, rounding), so
 * dividing by it would give shares that do not add up. This is approximate and
 * says so on screen. Rounded by largest remainder, so 33.3/33.3/33.3 reads
 * 34/33/33 rather than 99.
 *
 * The same for the pot and a serving (a share does not change with the count).
 * `null` when there is nothing to split.
 */
export function calorieSplit(m: Macros): Record<SplitKey, number> | null {
  const kcal = SPLIT_KEYS.map((k) => Math.max(0, m[k]) * KCAL_PER_GRAM[k]);
  const total = kcal.reduce((a, b) => a + b, 0);
  if (!(total > 0) || !Number.isFinite(total)) return null;
  const exact = kcal.map((c) => (c / total) * 100);
  const whole = exact.map(Math.floor);
  let left = 100 - whole.reduce((a, b) => a + b, 0);
  // Hand the leftover points to the largest remainders, ties to the earlier key.
  const order = exact
    .map((x, i) => ({ i, r: x - Math.floor(x) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    whole[i] += 1;
    left -= 1;
  }
  return { protein_g: whole[0], carbs_g: whole[1], fat_g: whole[2] };
}
