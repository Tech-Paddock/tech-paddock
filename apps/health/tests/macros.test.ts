import { describe, expect, it } from "vitest";
import { agrees, disagreements, parseMacros, scale, total, round, TOLERANCE } from "@/lib/macros";

const base = { kcal: 600, protein_g: 30, carbs_g: 50, fat_g: 25 };

describe("agreement", () => {
  it("treats a rounding-scale difference as agreement", () => {
    // 620 against 625 is the case that would otherwise ask you to arbitrate
    // forty times a week until you stopped reading it.
    expect(agrees({ ...base, kcal: 620 }, { ...base, kcal: 625 })).toBe(true);
  });

  it("treats a real gap as disagreement", () => {
    expect(agrees({ ...base, kcal: 620 }, { ...base, kcal: 890 })).toBe(false);
  });

  it("needs every field to agree, not the headline one", () => {
    // An otherwise-close estimate with one wildly wrong macro is exactly the
    // disagreement worth surfacing.
    const off = { ...base, fat_g: base.fat_g + 40 };
    expect(agrees(base, off)).toBe(false);
    expect(disagreements(base, off)).toEqual(["fat_g"]);
  });

  it("uses an absolute floor so small macros do not disagree over nothing", () => {
    // 20% of 2g is 0.4g, which would make every low-fat item disagree on a
    // rounding difference. The floor is the half that matters.
    expect(agrees({ ...base, fat_g: 2 }, { ...base, fat_g: 5 })).toBe(true);
    expect(TOLERANCE.macro.floor).toBeGreaterThan(0);
  });

  it("is symmetric", () => {
    const a = { ...base, kcal: 500 };
    const b = { ...base, kcal: 900 };
    expect(agrees(a, b)).toBe(agrees(b, a));
  });
});

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
