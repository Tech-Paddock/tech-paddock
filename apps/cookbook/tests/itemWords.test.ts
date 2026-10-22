import { describe, expect, it } from "vitest";
import { itemInName, itemWords, sameWord } from "@/lib/itemWords";
import { lineTerm } from "@/lib/cart";

/**
 * The item alone (TEC-131; `RULES.md`, *Send to cart*): the fixed rule a list
 * line goes through before Kroger's search, and before it is matched against
 * a saved product's official Kroger name. No model.
 */

describe("a line reduced to the item alone", () => {
  it.each([
    ["6 cloves of garlic", "garlic cloves"],
    ["2 cups chopped onion", "onion"],
    ["1 can of black beans", "black beans"],
    ["juice of 1 lemon", "lemon juice"],
    ["a pinch of salt", "salt"],
    ["salt, to taste", "salt"],
    ["2 lbs ground beef", "ground beef"],
    ["1 gal whole milk", "whole milk"],
    ["16.9 fl oz water", "water"],
    ["1 1/2 cups finely diced carrots", "carrots"],
    ["½ cup sugar", "sugar"],
    ["2-3 large eggs", "eggs"],
    ["butter, softened (room temperature)", "butter"],
    ["1 head of lettuce", "lettuce"],
    ["12oz frozen peas", "frozen peas"],
  ])("%s → %s", (line, item) => {
    expect(itemWords(line)).toBe(item);
  });

  it("keeps a percent, because 2% is the milk, not a quantity", () => {
    expect(itemWords("1 gal 2% milk")).toBe("2% milk");
  });

  it("keeps a count before pack, pk or ct: a multipack is a different product", () => {
    expect(itemWords("12 pack coke zero")).toBe("12 pack coke zero");
    expect(itemWords("18 ct eggs")).toBe("18 ct eggs");
  });

  it("does not flip cream of mushroom soup", () => {
    expect(itemWords("1 can cream of mushroom soup")).toBe("cream of mushroom soup");
  });

  it("keeps words that change the product", () => {
    expect(itemWords("fresh basil")).toBe("fresh basil");
    expect(itemWords("ground cinnamon")).toBe("ground cinnamon");
  });

  it("is empty when nothing is left, and the search then uses the line as typed", () => {
    expect(itemWords("2 cups")).toBe("");
    expect(lineTerm("2 cups")).toBe("2 cups");
  });

  it("the search falls back to the line when the item is too short for Kroger", () => {
    expect(lineTerm("1 ox")).toBe("1 ox");
    expect(lineTerm("2 cups chopped onion")).toBe("onion");
  });
});

describe("the item against an official Kroger name", () => {
  it("matches every item word as a whole word, in any order", () => {
    expect(itemInName("garlic cloves", "Fresh Peeled Garlic Cloves")).toBe(true);
    expect(itemInName("garlic cloves", "Cloves of Garlic, 3 oz")).toBe(true);
    expect(itemInName("garlic cloves", "Garlic Powder")).toBe(false);
  });

  it("allows a plural on either side, never a part of a word", () => {
    expect(sameWord("onion", "onions")).toBe(true);
    expect(sameWord("box", "boxes")).toBe(true);
    expect(itemInName("milk", "Buttermilk")).toBe(false);
  });

  it("an empty item matches nothing", () => {
    expect(itemInName("", "Anything")).toBe(false);
  });
});
