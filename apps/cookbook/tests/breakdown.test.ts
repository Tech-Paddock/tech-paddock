import { describe, expect, it } from "vitest";
import { calorieSplit, potAndServing } from "@/lib/breakdown";
import { perServing } from "@/lib/recipes";

/** The open recipe's Macro breakdown (TEC-140): pot beside serving, and the % split. */

const pot = { kcal: 2400, protein_g: 180, carbs_g: 120, fat_g: 100 };

describe("potAndServing", () => {
  it("shows the stored pot and the pot over the servings", () => {
    const { pot: p, serving } = potAndServing({ ...pot, servings: 4 });
    expect(p).toEqual(pot);
    expect(serving).toEqual({ kcal: 600, protein_g: 45, carbs_g: 30, fat_g: 25 });
  });

  it("agrees with perServing, rounded only for display", () => {
    const recipe = { kcal: 1000, protein_g: 70.4, carbs_g: 101, fat_g: 33.3, servings: 3 };
    const { pot: p, serving } = potAndServing(recipe);
    const exact = perServing(recipe);
    expect(p).toEqual({ kcal: 1000, protein_g: 70, carbs_g: 101, fat_g: 33 });
    expect(serving).toEqual({
      kcal: Math.round(exact.kcal),
      protein_g: Math.round(exact.protein_g),
      carbs_g: Math.round(exact.carbs_g),
      fat_g: Math.round(exact.fat_g),
    });
    expect(serving).toEqual({ kcal: 333, protein_g: 23, carbs_g: 34, fat_g: 11 });
  });

  it("reads a nonsense servings count as one, never Infinity", () => {
    expect(potAndServing({ ...pot, servings: 0 }).serving).toEqual(pot);
    expect(potAndServing({ ...pot, servings: -2 }).serving).toEqual(pot);
  });
});

describe("calorieSplit", () => {
  it("weighs protein and carbs at 4 kcal a gram and fat at 9", () => {
    // 180 g × 4 = 720, 120 g × 4 = 480, 100 g × 9 = 900; of 2100.
    expect(calorieSplit(pot)).toEqual({ protein_g: 34, carbs_g: 23, fat_g: 43 });
  });

  it("divides by the macros' own calories, not the stored kcal", () => {
    // Stored kcal 9999 changes nothing: the split is of what the grams supply.
    expect(calorieSplit({ ...pot, kcal: 9999 })).toEqual(calorieSplit(pot));
  });

  it("is the same for the pot and a serving", () => {
    expect(calorieSplit(perServing({ ...pot, servings: 6 }))).toEqual(calorieSplit(pot));
  });

  it("always adds to 100, by largest remainder", () => {
    // 25 g each: 100 / 100 / 225 kcal → 23.53 / 23.53 / 52.94.
    expect(calorieSplit({ kcal: 0, protein_g: 25, carbs_g: 25, fat_g: 25 })).toEqual({
      protein_g: 24,
      carbs_g: 23,
      fat_g: 53,
    });
    // An even three-way split: 33.3 each, the spare point to the first.
    expect(calorieSplit({ kcal: 0, protein_g: 9, carbs_g: 9, fat_g: 4 })).toEqual({
      protein_g: 34,
      carbs_g: 33,
      fat_g: 33,
    });
    for (const m of [
      { kcal: 1, protein_g: 1, carbs_g: 2, fat_g: 3 },
      { kcal: 1, protein_g: 0.7, carbs_g: 13.1, fat_g: 0.2 },
      { kcal: 1, protein_g: 41, carbs_g: 0, fat_g: 17 },
    ]) {
      const s = calorieSplit(m)!;
      expect(s.protein_g + s.carbs_g + s.fat_g).toBe(100);
    }
  });

  it("gives a macro with no grams 0%", () => {
    expect(calorieSplit({ kcal: 900, protein_g: 0, carbs_g: 0, fat_g: 100 })).toEqual({
      protein_g: 0,
      carbs_g: 0,
      fat_g: 100,
    });
  });

  it("has no split when there is nothing to split", () => {
    expect(calorieSplit({ kcal: 120, protein_g: 0, carbs_g: 0, fat_g: 0 })).toBeNull();
  });
});
