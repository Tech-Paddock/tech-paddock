import { describe, expect, it } from "vitest";
import { describeDrift, parseSize, sameSize, sizeDrift } from "@/lib/sizeDrift";

/** Size drift (TEC-131): the size first bought beside the size Kroger reports now. */

describe("reading Kroger's sizes", () => {
  it("weights, volumes and counts, into ounces, fluid ounces and items", () => {
    expect(parseSize("12 oz")).toEqual({ amount: 12, dimension: "weight" });
    expect(parseSize("1 lb")).toEqual({ amount: 16, dimension: "weight" });
    expect(parseSize("16.9 fl oz")).toEqual({ amount: 16.9, dimension: "volume" });
    expect(parseSize("1 gal")).toEqual({ amount: 128, dimension: "volume" });
    expect(parseSize("12 ct")).toEqual({ amount: 12, dimension: "count" });
  });

  it("a multipack is the count times the piece", () => {
    expect(parseSize("12 pk / 12 fl oz")).toEqual({ amount: 144, dimension: "volume" });
    expect(parseSize("2 x 6 oz")).toEqual({ amount: 12, dimension: "weight" });
  });

  it("does not guess at what it cannot read", () => {
    expect(parseSize("family size")).toBeNull();
    expect(parseSize("1 box")).toBeNull();
    expect(parseSize(null)).toBeNull();
  });
});

describe("drift", () => {
  it("is none for the same size, however it is written", () => {
    expect(sameSize("12 OZ", "12 oz")).toBe(true);
    expect(sameSize("1 lb", "16 oz")).toBe(true);
    expect(sizeDrift("12 oz", "12 oz", 3.49)).toBeNull();
  });

  it("says was and now, with price per unit at today's price where both sizes parse", () => {
    const drift = sizeDrift("12 oz", "10 oz", 3.49);
    expect(drift).toMatchObject({ was: "12 oz", now: "10 oz", perUnit: { unit: "oz" } });
    expect(describeDrift(drift!)).toBe("was 12 oz, now 10 oz — $3.49 is $0.349/oz now, $0.291/oz at 12 oz");
  });

  it("without a price, or with a size that does not parse, it is words only", () => {
    expect(describeDrift(sizeDrift("12 oz", "10 oz", null)!)).toBe("was 12 oz, now 10 oz");
    expect(describeDrift(sizeDrift("family size", "10 oz", 3.49)!)).toBe("was family size, now 10 oz");
  });

  it("needs both sizes", () => {
    expect(sizeDrift(null, "10 oz", 3)).toBeNull();
    expect(sizeDrift("12 oz", null, 3)).toBeNull();
  });
});
