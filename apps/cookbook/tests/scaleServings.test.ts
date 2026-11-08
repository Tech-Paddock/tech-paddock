import { describe, expect, it } from "vitest";
import {
  MAX_SERVINGS,
  MIN_SERVINGS,
  formatQuantity,
  scaleFactor,
  scaleIngredient,
  stepServings,
} from "@/lib/scaleServings";

describe("stepServings", () => {
  it("moves by one and stays between the limits", () => {
    expect(stepServings(4, 1)).toBe(5);
    expect(stepServings(4, -1)).toBe(3);
    expect(stepServings(MIN_SERVINGS, -1)).toBe(MIN_SERVINGS);
    expect(stepServings(MAX_SERVINGS, 1)).toBe(MAX_SERVINGS);
  });
});

describe("scaleFactor", () => {
  it("is view over stored, and 1 for a bad count", () => {
    expect(scaleFactor(6, 4)).toBe(1.5);
    expect(scaleFactor(2, 4)).toBe(0.5);
    expect(scaleFactor(3, 0)).toBe(1);
    expect(scaleFactor(0, 4)).toBe(1);
  });
});

describe("formatQuantity", () => {
  it("writes kitchen fractions", () => {
    expect(formatQuantity(0.5)).toBe("½");
    expect(formatQuantity(0.25)).toBe("¼");
    expect(formatQuantity(1 / 3)).toBe("⅓");
    expect(formatQuantity(2 / 3)).toBe("⅔");
    expect(formatQuantity(0.75)).toBe("¾");
    expect(formatQuantity(1.5)).toBe("1½");
    expect(formatQuantity(2)).toBe("2");
    expect(formatQuantity(2.99)).toBe("3");
  });
  it("rounds to the nearest fraction, never to nothing", () => {
    expect(formatQuantity(1.34)).toBe("1⅓");
    expect(formatQuantity(0.05)).toBe("⅛");
  });
  it("is a whole number from 20 up", () => {
    expect(formatQuantity(20.25)).toBe("20");
    expect(formatQuantity(300)).toBe("300");
  });
});

describe("scaleIngredient", () => {
  it("scales a plain count and keeps the words", () => {
    expect(scaleIngredient("2 tbsp olive oil", 2)).toBe("4 tbsp olive oil");
    expect(scaleIngredient("8 dried guajillo peppers", 1.5)).toBe("12 dried guajillo peppers");
  });
  it("shows fractions, from a fraction, a mixed number, a decimal or a glyph", () => {
    expect(scaleIngredient("1 cup flour", 0.5)).toBe("½ cup flour");
    expect(scaleIngredient("1/2 tsp salt", 3)).toBe("1½ tsp salt");
    expect(scaleIngredient("1 1/2 cups milk", 2)).toBe("3 cups milk");
    expect(scaleIngredient("2.5 lb pork", 2)).toBe("5 lb pork");
    expect(scaleIngredient("½ onion, minced", 2)).toBe("1 onion, minced");
    expect(scaleIngredient("1½ cups rice", 2)).toBe("3 cups rice");
    expect(scaleIngredient("1 ½ cups rice", 2)).toBe("3 cups rice");
    expect(scaleIngredient("1 cup rice", 1 / 3)).toBe("⅓ cup rice");
  });
  it("scales both ends of a range", () => {
    expect(scaleIngredient("2-3 cloves garlic", 2)).toBe("4-6 cloves garlic");
    expect(scaleIngredient("1 to 2 tsp sugar", 2)).toBe("2 to 4 tsp sugar");
  });
  it("scales a unit glued to the number", () => {
    expect(scaleIngredient("200g flour", 1.5)).toBe("300g flour");
  });
  it("leaves a line with no leading number as written", () => {
    expect(scaleIngredient("tortillas, as needed", 2)).toBe("tortillas, as needed");
    expect(scaleIngredient("Salt, to taste", 3)).toBe("Salt, to taste");
    expect(scaleIngredient("", 2)).toBe("");
  });
  it("scales only the leading number, not numbers later in the line", () => {
    expect(scaleIngredient("1 (14 oz) can tomatoes", 2)).toBe("2 (14 oz) can tomatoes");
    expect(scaleIngredient("salt, 2 pinches", 2)).toBe("salt, 2 pinches");
  });
  it("does not scale a size", () => {
    expect(scaleIngredient("2-inch piece ginger", 2)).toBe("2-inch piece ginger");
  });
  it("is the identical text at the stored servings", () => {
    for (const line of ["0.5 onion", "1 1/2 cups milk", "2-3 cloves", "tortillas"]) {
      expect(scaleIngredient(line, 1)).toBe(line);
    }
  });
});
