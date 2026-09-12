import { describe, expect, it } from "vitest";
import { percentToPpm, ppmToPercent, extractionYield, band, TDS_TARGET, YIELD_TARGET } from "@/lib/brews";

describe("TDS units", () => {
  it("converts both ways around one number", () => {
    expect(percentToPpm(1.38)).toBe(13800);
    expect(ppmToPercent(13800)).toBe(1.38);
    expect(percentToPpm(1)).toBe(10000);
  });

  it("round-trips without drifting", () => {
    // The two units are stored as one value and derived, so a reading that
    // survives a round trip is the point rather than a nicety.
    for (const pct of [0.8, 1.15, 1.35, 1.38, 2.05]) {
      expect(ppmToPercent(percentToPpm(pct))).toBe(pct);
    }
  });
});

describe("extractionYield", () => {
  it("computes the Sweet Bloom example", () => {
    // 18.5g in, ~280g in the cup, 1.38% TDS.
    expect(extractionYield({ doseG: 18.5, beverageG: 280, tdsPercent: 1.38 })).toBe(20.89);
  });

  it("answers null when any measurement is missing", () => {
    // A partial brew is not a yield of zero. It is not a yield.
    expect(extractionYield({ doseG: 18.5, beverageG: 280, tdsPercent: null })).toBeNull();
    expect(extractionYield({ doseG: null, beverageG: 280, tdsPercent: 1.38 })).toBeNull();
    expect(extractionYield({ doseG: 18.5, beverageG: null, tdsPercent: 1.38 })).toBeNull();
  });

  it("refuses nonsense rather than dividing by zero", () => {
    expect(extractionYield({ doseG: 0, beverageG: 280, tdsPercent: 1.38 })).toBeNull();
    expect(extractionYield({ doseG: -5, beverageG: 280, tdsPercent: 1.38 })).toBeNull();
  });

  it("shows why beverage mass is not water in", () => {
    // Same brew, measured off the kettle instead of the cup: 305g rather than
    // the ~280g that reaches the glass. It reads as over-extracted while the
    // coffee has not changed at all.
    const fromCup = extractionYield({ doseG: 18.5, beverageG: 280, tdsPercent: 1.38 })!;
    const fromKettle = extractionYield({ doseG: 18.5, beverageG: 305, tdsPercent: 1.38 })!;
    expect(band(fromCup, YIELD_TARGET)).toBe("in");
    expect(band(fromKettle, YIELD_TARGET)).toBe("over");
  });
});

describe("band", () => {
  it("places a reading against the target window", () => {
    expect(band(1.05, TDS_TARGET)).toBe("under");
    expect(band(1.25, TDS_TARGET)).toBe("in");
    expect(band(1.5, TDS_TARGET)).toBe("over");
    expect(band(null, TDS_TARGET)).toBeNull();
  });

  it("counts the boundaries as inside", () => {
    expect(band(YIELD_TARGET.low, YIELD_TARGET)).toBe("in");
    expect(band(YIELD_TARGET.high, YIELD_TARGET)).toBe("in");
  });
});
