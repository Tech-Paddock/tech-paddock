import { describe, expect, it } from "vitest";
import { addButtonLabel, dayChips, ratingPill, ratingWords, splitIngredient, RECIPE_TABS, FIRST_RECIPE_TAB } from "@/lib/recipeView";

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

describe("the day chips", () => {
  // Wednesday 2026-10-28.
  const chips = dayChips("2026-10-28");
  it("are Today, Tomorrow, then the next three days by name", () => {
    expect(chips.map((c) => c.label)).toEqual(["Today", "Tomorrow", "Friday", "Saturday", "Sunday"]);
    expect(chips.map((c) => c.day)).toEqual(["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  });
  it("cross a year end", () => {
    expect(dayChips("2026-12-30").map((c) => c.day)).toEqual([
      "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03",
    ]);
  });
  it("name the picked day on the button", () => {
    expect(addButtonLabel("2026-10-28", "2026-10-28")).toBe("Add to today's list");
    expect(addButtonLabel("2026-10-29", "2026-10-28")).toBe("Add to tomorrow's list");
    expect(addButtonLabel("2026-10-30", "2026-10-28")).toBe("Add to Friday's list");
    expect(addButtonLabel("2026-11-12", "2026-10-28")).toBe("Add to the list for Thu 11/12");
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
