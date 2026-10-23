import { describe, expect, it } from "vitest";
import { parseMacros, scale, total, round } from "@/lib/macros";

const base = { kcal: 600, protein_g: 30, carbs_g: 50, fat_g: 25 };

describe("arithmetic", () => {
  it("scales by quantity", () => {
    expect(scale(base, 2)).toEqual({ kcal: 1200, protein_g: 60, carbs_g: 100, fat_g: 50 });
  });

  it("totals a day, quantities included", () => {
    const sum = total([
      { macros: base, quantity: 1 },
      { macros: { kcal: 100, protein_g: 1, carbs_g: 20, fat_g: 0 }, quantity: 2 },
    ]);
    expect(sum.kcal).toBe(800);
    expect(sum.carbs_g).toBe(90);
  });

  it("rounds only for display", () => {
    expect(round({ kcal: 620.4, protein_g: 30.6, carbs_g: 50.5, fat_g: 24.4 }))
      .toEqual({ kcal: 620, protein_g: 31, carbs_g: 51, fat_g: 24 });
  });

  it("totals an empty day to zero rather than to nothing", () => {
    expect(total([])).toEqual({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  });
});

describe("parseMacros", () => {
  it("accepts a well-formed object", () => {
    expect(parseMacros(base)).toEqual(base);
  });

  it("accepts numeric strings, which is what jsonb and a model both produce", () => {
    expect(parseMacros({ kcal: "600", protein_g: "30", carbs_g: "50", fat_g: "25" })).toEqual(base);
  });

  it("rejects a partial object rather than defaulting the missing half to zero", () => {
    // A silently zeroed macro is a wrong total that looks like a right one.
    expect(parseMacros({ kcal: 600, protein_g: 30 })).toBeNull();
  });

  it("rejects negatives, nonsense and non-objects", () => {
    expect(parseMacros({ ...base, fat_g: -1 })).toBeNull();
    expect(parseMacros({ ...base, kcal: "lots" })).toBeNull();
    expect(parseMacros(null)).toBeNull();
    expect(parseMacros("600 kcal")).toBeNull();
  });
});
