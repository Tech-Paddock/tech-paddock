import { describe, expect, it } from "vitest";
import { factsLine, macrosLine, ratingPill, ratingWords, splitIngredient, RECIPE_TABS, FIRST_RECIPE_TAB } from "@/lib/recipeView";

/** TEC-183: what the pill, the tabs and the Add to list card say. */
describe("the pill's rating", () => {
  it("is the number then one star", () => {
    expect(ratingPill(5)).toBe("5★");
    expect(ratingPill(3)).toBe("3★");
  });
  it("is absent when unrated", () => {
    expect(ratingPill(null)).toBeNull();
    expect(ratingPill(0)).toBeNull();
    expect(ratingPill(undefined)).toBeNull();
  });
  it("is said in words on the open recipe", () => {
    expect(ratingWords(4)).toBe("4 of 5");
    expect(ratingWords(null)).toBe("Not rated");
  });
});

describe("the tabs", () => {
  it("are Ingredients, Method, Macros, and it opens on Ingredients", () => {
    expect(RECIPE_TABS.map((t) => t.label)).toEqual(["Ingredients", "Method", "Macros"]);
    expect(FIRST_RECIPE_TAB).toBe("ingredients");
  });
});

describe("the list line (TEC-189)", () => {
  const base = { rating: 5, servings: 4, total_minutes: null, prep_minutes: 15, cook_minutes: 30 };
  const text = (r: Parameters<typeof factsLine>[0]) => {
    const f = factsLine(r);
    return f.stars ? `${f.stars} · ${f.rest}` : f.rest;
  };
  it("reads rating · Prep · Cook · makes N", () => {
    expect(text(base)).toBe("5★ · Prep 15m · Cook 30m · makes 4");
  });
  it("drops each part that is unset", () => {
    expect(text({ ...base, rating: null })).toBe("Prep 15m · Cook 30m · makes 4");
    expect(text({ ...base, cook_minutes: null })).toBe("5★ · Prep 15m · makes 4");
    expect(text({ ...base, prep_minutes: null, cook_minutes: null })).toBe("5★ · makes 4");
  });
  it("shows the old total only when neither prep nor cook is set", () => {
    expect(text({ ...base, prep_minutes: null, cook_minutes: null, total_minutes: 35 })).toBe("5★ · 35 min · makes 4");
    expect(text({ ...base, total_minutes: 35 })).toBe("5★ · Prep 15m · Cook 30m · makes 4");
  });
  it("gives one serving's numbers as text", () => {
    expect(macrosLine({ kcal: 519.6, protein_g: 38.2, carbs_g: 41.5, fat_g: 18 })).toBe("520 kcal · 38p · 42c · 18f");
  });
});

describe("an ingredient's amount column", () => {
  it("takes a leading amount and its unit", () => {
    expect(splitIngredient("2 tbsp olive oil")).toEqual({ amount: "2 tbsp", text: "olive oil" });
    expect(splitIngredient("1/2 cup rice")).toEqual({ amount: "1/2 cup", text: "rice" });
    expect(splitIngredient("1 1/2 lb chicken thighs")).toEqual({ amount: "1 1/2 lb", text: "chicken thighs" });
    expect(splitIngredient("200g flour")).toEqual({ amount: "200g", text: "flour" });
    expect(splitIngredient("2-3 cloves garlic")).toEqual({ amount: "2-3 cloves", text: "garlic" });
    expect(splitIngredient("½ cup milk")).toEqual({ amount: "½ cup", text: "milk" });
  });
  it("takes a bare count", () => {
    expect(splitIngredient("2 large eggs")).toEqual({ amount: "2", text: "large eggs" });
  });
  it("leaves a line with no leading amount as it is", () => {
    expect(splitIngredient("Salt, to taste")).toEqual({ amount: null, text: "Salt, to taste" });
    expect(splitIngredient("Olive oil")).toEqual({ amount: null, text: "Olive oil" });
  });
});
