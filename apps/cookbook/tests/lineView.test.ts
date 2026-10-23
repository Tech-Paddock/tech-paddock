import { describe, expect, it } from "vitest";
import { cartQuantity, combine, formatAmounts, leadingAmount, lineView, noteAmounts } from "@/lib/lineView";

/**
 * A list line as what you buy (TEC-131; `RULES.md`, *Storage*): the item
 * without prep words, its recipes, the combined amount, and the cart quantity
 * rounded up. Fixed rules, no model; the stored line is never rewritten.
 */

const GARLIC = { label: "Heads of Garlic", size: 10, unit: "cloves" };

describe("the name", () => {
  it("is the item without quantities or prep words, capitalised", () => {
    expect(lineView({ name: "garlic, thinly sliced", note: null }, null).name).toBe("Garlic");
    expect(lineView({ name: "2 cups chopped onion", note: null }, null).name).toBe("Onion");
    expect(lineView({ name: "6 cloves of garlic", note: null }, null).name).toBe("Garlic");
    expect(lineView({ name: "1 (14 oz) can diced tomatoes", note: null }, null).name).toBe("Tomatoes");
  });

  it("is the saved product's shopping unit when it has one", () => {
    expect(lineView({ name: "8 cloves garlic, minced", note: null }, GARLIC).name).toBe("Heads of Garlic");
    expect(lineView({ name: "garlic", note: null }, { label: null, size: 10, unit: "cloves" }).name).toBe("Garlic");
  });

  it("keeps a multipack's count in the name, not the amount", () => {
    expect(lineView({ name: "12 pack coke zero", note: null }, null)).toMatchObject({ name: "12 pack coke zero", amount: null, quantity: 1 });
  });
});

describe("the amount", () => {
  it("reads the front of the line: whole numbers, fractions, mixed numbers, ranges", () => {
    expect(leadingAmount("1 1/2 cups flour").amount).toEqual({ qty: { n: 3, d: 2 }, unit: "cup" });
    expect(leadingAmount("½ cup sugar").amount).toEqual({ qty: { n: 1, d: 2 }, unit: "cup" });
    expect(leadingAmount("2-3 carrots").amount).toEqual({ qty: { n: 3, d: 1 }, unit: null });
    expect(leadingAmount("a pinch of salt")).toEqual({ amount: { qty: { n: 1, d: 1 }, unit: "pinch" }, rest: "salt" });
    expect(leadingAmount("salt").amount).toBeNull();
  });

  it("adds the same units, and keeps fractions readable", () => {
    expect(lineView({ name: "black pepper", note: "1/4 tsp and 1/2 tsp" }, null)).toMatchObject({ name: "Black pepper", amount: "3/4 tsp", note: null });
    expect(formatAmounts(combine([{ qty: { n: 1, d: 3 }, unit: "cup" }, { qty: { n: 1, d: 3 }, unit: "cup" }]))).toBe("2/3 cup");
    expect(formatAmounts(combine([{ qty: { n: 3, d: 4 }, unit: "cup" }, { qty: { n: 3, d: 4 }, unit: "cup" }]))).toBe("1 1/2 cups");
  });

  it("combines known conversions into the smallest unit present", () => {
    expect(lineView({ name: "1 tbsp olive oil", note: "1 tsp" }, null).amount).toBe("4 tsp");
    expect(formatAmounts(combine([{ qty: { n: 1, d: 1 }, unit: "lb" }, { qty: { n: 4, d: 1 }, unit: "oz" }]))).toBe("20 oz");
  });

  it("lists different units without a known conversion side by side", () => {
    expect(lineView({ name: "garlic", note: "2 cloves and 1 tbsp minced" }, null).amount).toBe("2 cloves + 1 tbsp");
  });

  it("a typed note still shows; a note that is only amounts becomes the amount", () => {
    expect(lineView({ name: "Milk", note: "the big box" }, null)).toMatchObject({ amount: null, note: "the big box" });
    expect(noteAmounts("the big box")).toBeNull();
    expect(noteAmounts("1/4 tsp + 1/2 tsp total")).toHaveLength(2);
  });
});

describe("the cart quantity, rounded up", () => {
  it("with a pack conversion: the amount in packs — 14 cloves at 10 a head is 2 heads", () => {
    expect(lineView({ name: "14 cloves garlic", note: null }, GARLIC).quantity).toBe(2);
    expect(lineView({ name: "8 cloves garlic", note: null }, GARLIC).quantity).toBe(1);
    expect(lineView({ name: "garlic", note: "6 cloves and 8 cloves" }, GARLIC)).toMatchObject({ amount: "14 cloves", quantity: 2 });
  });

  it("a conversion in a unit of the same family converts: 3 cups of stock at 32 fl oz a carton", () => {
    expect(cartQuantity([{ qty: { n: 6, d: 1 }, unit: "cup" }], { label: null, size: 32, unit: "fl oz" })).toBe(2);
  });

  it("a conversion in a unit this app does not know counts plain numbers: 18 eggs at 12 a carton", () => {
    expect(lineView({ name: "18 eggs", note: null }, { label: "Cartons of Eggs", size: 12, unit: "eggs" }).quantity).toBe(2);
  });

  it("without one: a typed count is the quantity", () => {
    expect(lineView({ name: "2 onions", note: null }, null).quantity).toBe(2);
    expect(lineView({ name: "3 bunches cilantro", note: null }, null).quantity).toBe(3);
  });

  it("without one: a measure is one container", () => {
    expect(lineView({ name: "3/4 tsp black pepper", note: null }, null).quantity).toBe(1);
    expect(lineView({ name: "14 cloves garlic", note: null }, null).quantity).toBe(1);
    expect(lineView({ name: "milk", note: null }, null).quantity).toBe(1);
  });

});
