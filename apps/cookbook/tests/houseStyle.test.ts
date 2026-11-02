import { describe, expect, it } from "vitest";
import { HOUSE_STYLE, leadingAmount, restyleProblem, spellUnits, yieldCount } from "@/lib/houseStyle";

/**
 * The house style (TEC-201). What has to hold: units have one spelling, and a
 * restyle never changes the recipe: the same ingredient lines, the same amounts,
 * and every number the method had. No recipe data here, only invented lines.
 */

describe("one spelling for each unit", () => {
  it.each([
    ["2 teaspoons salt", "2 tsp salt"],
    ["1 Tablespoon olive oil", "1 tbsp olive oil"],
    ["3 tbsps butter", "3 tbsp butter"],
    ["1/2 cups milk", "1/2 cup milk"],
    ["½ cups milk", "½ cup milk"],
    ["1 cups rice", "1 cup rice"],
    ["2 cup flour", "2 cups flour"],
    ["1½ cup sugar", "1½ cups sugar"],
    ["1 1/2 cup oats", "1 1/2 cups oats"],
    ["1-2 cup stock", "1-2 cups stock"],
    ["8 ounces pasta", "8 oz pasta"],
    ["1 pound beef", "1 lb beef"],
    ["2 lbs potatoes", "2 lb potatoes"],
    ["1 tbsp. olive oil", "1 tbsp olive oil"],
    ["1½ teaspoons cumin", "1½ tsp cumin"],
  ])("%s -> %s", (before, after) => {
    expect(spellUnits(before)).toBe(after);
  });

  it("writes temperatures one way", () => {
    expect(spellUnits("Bake at 350 degrees F for 20 minutes.")).toBe("Bake at 350°F for 20 minutes.");
    expect(spellUnits("Preheat to 400 F.")).toBe("Preheat to 400°F.");
    expect(spellUnits("Heat to 180 ° C")).toBe("Heat to 180°C");
    expect(spellUnits("Bake at 350°F.")).toBe("Bake at 350°F.");
  });

  it("touches a unit only after a number, and keeps a sentence's own full stop", () => {
    expect(spellUnits("Put it in the cupboard")).toBe("Put it in the cupboard");
    expect(spellUnits("Pound the chicken flat.")).toBe("Pound the chicken flat.");
    expect(spellUnits("Add 2 tsp. Stir well.")).toBe("Add 2 tsp. Stir well.");
  });

  it("is idempotent", () => {
    const once = spellUnits("2 tablespoons oil, 1 teaspoon salt, 350 degrees F");
    expect(spellUnits(once)).toBe(once);
  });
});

describe("the amount an ingredient leads with", () => {
  it("reads numbers, fractions, mixed numbers, ranges and units", () => {
    expect(leadingAmount("1 cup onion")).toEqual({ low: 1, high: null, unit: "cup" });
    expect(leadingAmount("1/2 tsp salt")).toEqual({ low: 0.5, high: null, unit: "tsp" });
    expect(leadingAmount("1 1/2 cups flour")).toEqual({ low: 1.5, high: null, unit: "cup" });
    expect(leadingAmount("1½ cups flour")).toEqual({ low: 1.5, high: null, unit: "cup" });
    expect(leadingAmount("2-3 cloves garlic")).toEqual({ low: 2, high: 3, unit: null });
    expect(leadingAmount("500g beef")).toEqual({ low: 500, high: null, unit: "g" });
    expect(leadingAmount("a pinch of salt")).toEqual({ low: 1, high: null, unit: null });
  });

  it("is null for a line that leads with no amount", () => {
    expect(leadingAmount("Salt, to taste")).toBeNull();
    expect(leadingAmount("For the sauce:")).toBeNull();
  });
});

describe("a restyle never changes the recipe", () => {
  const before = {
    ingredients: [
      "1 cup onions, chopped",
      "2 cloves garlic, minced",
      "1 (14 oz) can diced tomatoes, drained",
      "2 tablespoons olive oil",
      "1 1/2 lbs chicken thighs, cut into 1-inch pieces",
      "Salt, to taste",
    ],
    method: "1. Cook the onions 5 minutes. 2. Add the tomatoes and simmer 20 minutes at 350 degrees F.",
  };
  const after = {
    ingredients: [
      "1 cup onion",
      "2 cloves garlic",
      "1 can (14 oz) diced tomatoes",
      "2 tbsp olive oil",
      "1 1/2 lb chicken thighs",
      "Salt, to taste",
    ],
    method:
      "1. Chop the onion. Mince the garlic. Drain the tomatoes. Cut the chicken into 1-inch pieces.\n" +
      "2. Cook the onion 5 minutes.\n3. Add the tomatoes and simmer 20 minutes at 350°F.",
  };

  it("passes when prep moved and the units were respelled: same count, same amounts", () => {
    expect(after.ingredients).toHaveLength(before.ingredients.length);
    expect(restyleProblem(before, after)).toBeNull();
  });

  it("refuses a dropped ingredient", () => {
    const dropped = { ...after, ingredients: after.ingredients.slice(1) };
    expect(restyleProblem(before, dropped)).toMatch(/5 ingredient lines, not 6/);
  });

  it("refuses an added ingredient", () => {
    expect(restyleProblem(before, { ...after, ingredients: [...after.ingredients, "1 tsp pepper"] })).toMatch(/7 ingredient lines/);
  });

  it("refuses a changed amount", () => {
    const changed = { ...after, ingredients: after.ingredients.map((l) => l.replace("2 tbsp olive oil", "3 tbsp olive oil")) };
    expect(restyleProblem(before, changed)).toMatch(/amount changed on "2 tablespoons olive oil"/);
  });

  it("refuses a changed unit", () => {
    const changed = { ...after, ingredients: after.ingredients.map((l) => l.replace("2 tbsp olive oil", "2 tsp olive oil")) };
    expect(restyleProblem(before, changed)).toMatch(/amount changed/);
  });

  it("refuses a time or temperature the method lost", () => {
    expect(restyleProblem(before, { ...after, method: "1. Chop the onion.\n2. Cook it.\n3. Simmer at 350°F." })).toMatch(/lost the number 5/);
    expect(restyleProblem(before, { ...after, method: after.method.replace("350°F", "a hot oven") })).toMatch(/lost the number 350/);
  });

  it("ignores step numbers and the way a fraction is written", () => {
    expect(restyleProblem({ ingredients: ["1 cup rice"], method: "1. Use ½ cup water." }, { ingredients: ["1 cup rice"], method: "1. Add 1/2 cup water." })).toBeNull();
  });

  it("allows a recipe with no method to gain one from the prep words", () => {
    expect(restyleProblem({ ingredients: ["1 onion, diced"], method: null }, { ingredients: ["1 onion"], method: "1. Dice the onion." })).toBeNull();
  });
});

describe("the serving count in a yield text", () => {
  it.each([
    ["4", 4],
    ["Serves 6", 6],
    ["Serves 4-6", 4],
    ["Makes 24 cookies", 24],
    ["2 loaves", 2],
  ])("%s -> %s", (text, n) => {
    expect(yieldCount(text)).toBe(n);
  });

  it.each(["", "   ", "a crowd", "9x13 pan", "0", "250 portions"])("%j gives no count", (text) => {
    expect(yieldCount(text)).toBeNull();
  });

  it("gives none for something that is not text", () => {
    expect(yieldCount(undefined)).toBeNull();
    expect(yieldCount(4)).toBeNull();
  });
});

describe("the prompt", () => {
  it("states every rule once, for every path to use", () => {
    for (const rule of ["amount, unit, item", "Prep words", "numbered, imperative steps", "tsp, tbsp, oz, lb, °F", "\"cups\" above 1", "NEVER CHANGES"]) {
      expect(HOUSE_STYLE).toContain(rule);
    }
  });
});
