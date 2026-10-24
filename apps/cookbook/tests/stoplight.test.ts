import { describe, expect, it } from "vitest";
import {
  GREEN_UNDER_MEAN,
  HISTORY_WEEKS,
  MIN_WEEKS,
  NEW_LABEL,
  RED_OVER_MEAN,
  stoplight,
  weeksInWindow,
  type WeekStat,
} from "@/lib/stoplight";
import { addDays } from "@/lib/priceDates";

/**
 * The Deals stoplight (TEC-132): today's price against a product's own last
 * twelve weeks. Made-up numbers only. The thresholds are named constants
 * (TEC-138 reviews them), so the edge tests are written from the constants'
 * own values where they can be, and from literal dollars where the owner's
 * words are the spec.
 */

const AS_OF = "2026-10-26"; // a Monday

/** `n` full weeks, newest first ending the Monday before AS_OF, each with the same low and mean. */
function weeks(n: number, low: number, mean: number, nights = 7): WeekStat[] {
  return Array.from({ length: n }, (_, i) => ({ week_start: addDays("2026-10-19", -7 * i), low, mean, nights_seen: nights }));
}

describe("the thresholds are the owner's", () => {
  it("are 15% under for green, 10% over for red, four weeks to colour, twelve to look back", () => {
    expect(GREEN_UNDER_MEAN).toBe(0.15);
    expect(RED_OVER_MEAN).toBe(0.1);
    expect(MIN_WEEKS).toBe(4);
    expect(HISTORY_WEEKS).toBe(12);
  });
});

describe("new: building history", () => {
  it("is under four weeks, however the price looks", () => {
    for (const n of [0, 1, 3]) {
      const v = stoplight(1, weeks(n, 5, 5), AS_OF);
      expect(v.light).toBe("new");
      expect(v.note).toBe("new: building history");
      expect(v.note).toBe(NEW_LABEL);
      expect(v.weeks).toBe(n);
      expect(v.mean).toBeNull();
    }
  });

  it("four weeks is enough to colour", () => {
    expect(stoplight(1, weeks(4, 5, 5), AS_OF).light).toBe("green");
    expect(stoplight(9, weeks(4, 5, 5), AS_OF).light).toBe("red");
  });

  it("counts only weeks inside the twelve before today: a gap does not stretch the window", () => {
    // Three recent weeks and two from the spring: only three count.
    const old = [{ week_start: "2026-04-06", low: 5, mean: 5, nights_seen: 7 }, { week_start: "2026-04-13", low: 5, mean: 5, nights_seen: 7 }];
    expect(stoplight(1, [...weeks(3, 5, 5), ...old], AS_OF)).toMatchObject({ light: "new", weeks: 3 });
  });
});

describe("green", () => {
  const history = [...weeks(6, 4.5, 5), ...weeks(6, 4.5, 5).map((w) => ({ ...w, week_start: addDays(w.week_start, -42) }))];

  it("at or below the 12-week low", () => {
    expect(stoplight(4.5, history, AS_OF)).toMatchObject({ light: "green", note: "at its 12-week low of $4.50" });
    expect(stoplight(4.49, history, AS_OF).light).toBe("green");
  });

  it("one cent above the low, and not 15% under the mean, is not green", () => {
    expect(stoplight(4.51, history, AS_OF).light).toBe("neutral");
  });

  it("at least 15% under the mean, exactly 15% included", () => {
    const flatLow = weeks(8, 3, 5); // low 3, so only the mean rule can fire for 4.25
    expect(stoplight(4.25, flatLow, AS_OF)).toMatchObject({ light: "green", note: "15% under its usual" });
    expect(stoplight(4.26, flatLow, AS_OF).light).toBe("neutral");
  });

  it("the low is the lowest weekly low, not the lowest mean", () => {
    const mixed = [...weeks(5, 5, 5), { week_start: "2026-09-07", low: 3.99, mean: 5, nights_seen: 7 }];
    expect(stoplight(3.99, mixed, AS_OF).light).toBe("green");
    expect(stoplight(4.5, mixed, AS_OF).light).toBe("neutral"); // above the 3.99 low, and only 10% under the mean
  });

  it("a product whose price never moves is at its low, so it is green (as the rule is written)", () => {
    expect(stoplight(3.99, weeks(12, 3.99, 3.99), AS_OF)).toMatchObject({ light: "green", note: "at its 12-week low of $3.99" });
  });
});

describe("red", () => {
  const history = weeks(8, 3, 5);

  it("at least 10% over the mean, exactly 10% included", () => {
    expect(stoplight(5.5, history, AS_OF)).toMatchObject({ light: "red", note: "10% over its usual" });
    expect(stoplight(5.51, history, AS_OF).light).toBe("red");
  });

  it("one cent under 10% over is not red", () => {
    expect(stoplight(5.49, history, AS_OF)).toMatchObject({ light: "neutral", note: "10% over its usual" });
  });

  it("a sale price can still be red: the colour reads the price, not Kroger's tag", () => {
    // Usually $5.00; "on sale" at $5.60 is still 12% over.
    expect(stoplight(5.6, history, AS_OF).light).toBe("red");
  });
});

describe("neutral", () => {
  it("is anything between, and says how far", () => {
    const history = weeks(8, 3, 5);
    expect(stoplight(5, history, AS_OF)).toMatchObject({ light: "neutral", note: "about its usual" });
    expect(stoplight(4.5, history, AS_OF)).toMatchObject({ light: "neutral", note: "10% under its usual" });
    expect(stoplight(5.2, history, AS_OF)).toMatchObject({ light: "neutral", note: "4% over its usual" });
  });
});

describe("the mean is over nights", () => {
  it("a thin week weighs less than a full one", () => {
    // Six full weeks at a $5.00 mean and one three-night week at $2.00: the
    // night-weighted mean is (6*7*5 + 3*2) / 45 = 4.80. A flat average of the
    // seven weeks would be 4.57, and $5.10 would then read red (10% over).
    const history = [...weeks(6, 5, 5), { week_start: "2026-09-07", low: 2, mean: 2, nights_seen: 3 }];
    const v = stoplight(5.1, history, AS_OF);
    expect(v.mean).toBeCloseTo((6 * 7 * 5 + 3 * 2) / 45, 6);
    expect(v.light).toBe("neutral");
  });
});

describe("the window", () => {
  it("keeps twelve weeks and drops the thirteenth", () => {
    const inside = { week_start: addDays(AS_OF, -7 * HISTORY_WEEKS), low: 1, mean: 1, nights_seen: 7 };
    const outside = { week_start: addDays(AS_OF, -7 * HISTORY_WEEKS - 7), low: 1, mean: 1, nights_seen: 7 };
    expect(weeksInWindow([inside, outside], AS_OF)).toEqual([inside]);
  });
});
