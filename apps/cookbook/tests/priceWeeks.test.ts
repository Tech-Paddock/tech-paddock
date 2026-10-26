import { describe, expect, it } from "vitest";
import { addDays, denverDate, finishedWeeks, isoWeekday, mondayOf } from "@/lib/priceDates";
import { effectivePrice, nightOnSale, rollUpWeek, type NightPrice } from "@/lib/priceWeeks";

/** The Monday roll-up's maths (TEC-132). Made-up products and prices. */

const STORE = "01400999";
const COLA = "0001111000001";
const OATS = "0001111000002";

const night = (product_id: string, night: string, regular: number | null, sale: number | null, location_id = STORE): NightPrice => ({
  product_id,
  location_id,
  night,
  regular,
  sale,
});

describe("Denver dates", () => {
  it("reads the night in Denver, not UTC: 09:00 UTC is 03:00 or 02:00 the same day", () => {
    expect(denverDate(new Date("2026-10-24T09:00:00Z"))).toBe("2026-10-24"); // MDT
    expect(denverDate(new Date("2026-12-14T09:00:00Z"))).toBe("2026-12-14"); // MST
    // The evening before in Denver is still the earlier date at 01:00 UTC.
    expect(denverDate(new Date("2026-10-25T01:00:00Z"))).toBe("2026-10-24");
  });

  it("keeps the same Denver date across the daylight-saving change", () => {
    // 2026-11-01 is the fall-back Sunday: 09:00 UTC is 02:00 MST that day.
    expect(denverDate(new Date("2026-11-01T09:00:00Z"))).toBe("2026-11-01");
    expect(denverDate(new Date("2026-03-08T09:00:00Z"))).toBe("2026-03-08"); // spring forward: 03:00 MDT
  });

  it("does date arithmetic without the zone getting in", () => {
    expect(addDays("2026-10-26", -7)).toBe("2026-10-19");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(isoWeekday("2026-10-26")).toBe(1);
    expect(isoWeekday("2026-10-25")).toBe(7);
    expect(mondayOf("2026-10-25")).toBe("2026-10-19");
    expect(mondayOf("2026-10-26")).toBe("2026-10-26");
  });

  it("lists the finished weeks before the current one, oldest first, whatever day it is", () => {
    // Monday to Sunday of the week of 10-26 are all in that week, which is not finished.
    for (const d of ["2026-10-26", "2026-10-28", "2026-11-01"]) {
      expect(finishedWeeks(d, 2)).toEqual(["2026-10-12", "2026-10-19"]);
    }
    expect(finishedWeeks("2026-11-02", 2)).toEqual(["2026-10-19", "2026-10-26"]);
  });
});

describe("the effective price", () => {
  it("is the sale if there is one, else the regular", () => {
    expect(effectivePrice({ regular: 5, sale: 3.49 })).toBe(3.49);
    expect(effectivePrice({ regular: 5, sale: null })).toBe(5);
    expect(effectivePrice({ regular: null, sale: 3.49 })).toBe(3.49);
    expect(effectivePrice({ regular: null, sale: null })).toBeNull();
  });

  it("is on sale when the sale is below the regular, or the regular is unknown", () => {
    expect(nightOnSale({ regular: 5, sale: 3.49 })).toBe(true);
    expect(nightOnSale({ regular: 5, sale: 5 })).toBe(false);
    expect(nightOnSale({ regular: 5, sale: null })).toBe(false);
    expect(nightOnSale({ regular: null, sale: 3.49 })).toBe(true);
  });
});

describe("rolling up a week", () => {
  const WEEK = "2026-10-19";

  it("gives low, high, mean, regular mean, nights on sale and nights seen over the effective price", () => {
    // Mon-Sun: five regular nights at 5.00, two sale nights at 3.50 and 3.00.
    const nights = [
      night(COLA, "2026-10-19", 5, null),
      night(COLA, "2026-10-20", 5, null),
      night(COLA, "2026-10-21", 5, 3.5),
      night(COLA, "2026-10-22", 5, 3),
      night(COLA, "2026-10-23", 5, null),
      night(COLA, "2026-10-24", 5, null),
      night(COLA, "2026-10-25", 5, null),
    ];
    expect(rollUpWeek(nights, WEEK)).toEqual([
      {
        product_id: COLA,
        location_id: STORE,
        week_start: WEEK,
        low: 3,
        high: 5,
        mean: Math.round(((5 * 5 + 3.5 + 3) / 7) * 10_000) / 10_000, // 4.5
        regular_mean: 5,
        nights_on_sale: 2,
        nights_seen: 7,
      },
    ]);
  });

  it("a missed night is a gap: the mean is over the nights that exist, and nothing is filled in", () => {
    const nights = [night(COLA, "2026-10-19", 4, null), night(COLA, "2026-10-22", 6, null), night(COLA, "2026-10-25", 5, null)];
    const [row] = rollUpWeek(nights, WEEK);
    expect(row).toMatchObject({ low: 4, high: 6, mean: 5, nights_seen: 3 });
  });

  it("rounds the mean once, to four places", () => {
    const nights = [night(COLA, "2026-10-19", 1, null), night(COLA, "2026-10-20", 1, null), night(COLA, "2026-10-21", 2, null)];
    expect(rollUpWeek(nights, WEEK)[0].mean).toBe(1.3333);
  });

  it("a sale with no regular price still counts, and the regular mean is null when no night had one", () => {
    const [row] = rollUpWeek([night(OATS, "2026-10-19", null, 2.5), night(OATS, "2026-10-20", null, 2.5)], WEEK);
    expect(row).toMatchObject({ low: 2.5, high: 2.5, mean: 2.5, regular_mean: null, nights_on_sale: 2, nights_seen: 2 });
  });

  it("the regular mean is over the nights that gave a regular price", () => {
    const [row] = rollUpWeek([night(OATS, "2026-10-19", 4, null), night(OATS, "2026-10-20", null, 2), night(OATS, "2026-10-21", 6, null)], WEEK);
    expect(row.regular_mean).toBe(5);
    expect(row.mean).toBeCloseTo(4, 4);
  });

  it("counts only the week's own nights", () => {
    const nights = [
      night(COLA, "2026-10-18", 9, null), // the Sunday before
      night(COLA, "2026-10-19", 5, null),
      night(COLA, "2026-10-25", 5, null),
      night(COLA, "2026-10-26", 9, null), // the Monday after
    ];
    expect(rollUpWeek(nights, WEEK)[0]).toMatchObject({ high: 5, nights_seen: 2 });
  });

  it("keeps products and stores apart, in a stable order", () => {
    const nights = [
      night(OATS, "2026-10-19", 3, null),
      night(COLA, "2026-10-19", 5, null),
      night(COLA, "2026-10-19", 6, null, "01400111"),
    ];
    expect(rollUpWeek(nights, WEEK).map((r) => [r.location_id, r.product_id, r.mean])).toEqual([
      ["01400111", COLA, 6],
      [STORE, COLA, 5],
      [STORE, OATS, 3],
    ]);
  });

  it("a repeated night counts once, and a week with nothing makes no rows", () => {
    expect(rollUpWeek([night(COLA, "2026-10-19", 5, null), night(COLA, "2026-10-19", 5, null)], WEEK)[0].nights_seen).toBe(1);
    expect(rollUpWeek([], WEEK)).toEqual([]);
    expect(rollUpWeek([night(COLA, "2026-10-19", null, null)], WEEK)).toEqual([]);
  });
});
