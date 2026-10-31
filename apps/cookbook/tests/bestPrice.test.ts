import { describe, expect, it } from "vitest";
import { BEST_MIN_NIGHTS, BEST_WITHIN, bestPrice } from "@/lib/bestPrice";
import { addDays } from "@/lib/priceDates";
import { NO_FILTER, emptyMessage, matchesFilter } from "@/lib/dealFilter";
import type { DealBoard, DealRow } from "@/lib/dealRows";

/** "Best" (TEC-196): tonight at, or within 5% of, the lowest night in 12 weeks; at least 2 nights. */

const AS_OF = "2026-10-29";
const n = (daysAgo: number, regular: number | null, sale: number | null = null) => ({ night: addDays(AS_OF, -daysAgo), regular, sale });

describe("bestPrice", () => {
  it("names its constants: 5% and 2 nights", () => {
    expect(BEST_WITHIN).toBe(0.05);
    expect(BEST_MIN_NIGHTS).toBe(2);
  });

  it("one night of history is not enough, however good the price looks", () => {
    const b = bestPrice(2, [n(0, 2)], AS_OF);
    expect(b).toMatchObject({ qualifies: false, why: "few-nights", nights: 1 });
    expect(bestPrice(2, [], AS_OF)).toMatchObject({ qualifies: false, why: "few-nights", nights: 0, low: null });
  });

  it("two nights are enough: at the low qualifies", () => {
    expect(bestPrice(2, [n(0, 2), n(1, 3)], AS_OF)).toMatchObject({ qualifies: true, why: "best", low: 2, nights: 2 });
  });

  it("within 5% of the low qualifies, exactly 5% included, and over it does not", () => {
    const history = [n(1, 4), n(2, 5), n(3, 6)];
    expect(bestPrice(4, history, AS_OF).qualifies).toBe(true);
    expect(bestPrice(4.2, history, AS_OF).qualifies).toBe(true); // 4 * 1.05, a float edge
    expect(bestPrice(4.21, history, AS_OF)).toMatchObject({ qualifies: false, why: "above", low: 4 });
  });

  it("reads a night's effective price: the sale when there is one, else the regular", () => {
    const history = [n(1, 5, 3), n(2, 5), n(3, 5)];
    expect(bestPrice(3.1, history, AS_OF)).toMatchObject({ qualifies: true, low: 3 });
    expect(bestPrice(5, history, AS_OF)).toMatchObject({ qualifies: false });
  });

  it("looks back 12 weeks and no further, and ignores nights from the future", () => {
    // Day 84 back is the edge and counts; day 85 does not.
    const edge = [n(7 * 12, 1), n(7 * 12 + 1, 1), n(1, 5), n(2, 5)];
    expect(bestPrice(5, edge, AS_OF)).toMatchObject({ qualifies: false, low: 1, nights: 3 });
    const tooOld = [n(7 * 12 + 1, 1), n(7 * 12 + 2, 1), n(1, 5), n(2, 5)]; // two nights are left, both 5
    expect(bestPrice(5, tooOld, AS_OF)).toMatchObject({ qualifies: true, low: 5, nights: 2 });
    const future = [n(-1, 1), n(1, 5), n(2, 5)];
    expect(bestPrice(5, future, AS_OF)).toMatchObject({ low: 5, nights: 2 });
  });

  it("a night with no price counts for nothing", () => {
    expect(bestPrice(3, [n(0, null), n(1, 3), n(2, null)], AS_OF)).toMatchObject({ qualifies: false, why: "few-nights", nights: 1 });
  });
});

describe("Best on the Deals board", () => {
  const board = (over: Partial<DealBoard> = {}): DealBoard => ({
    store: "Test Store",
    asOf: AS_OF,
    rows: [{ light: "new", weeks: 0, best: { qualifies: false, low: null, nights: 0, why: "few-nights" } } as DealRow],
    couponsStaged: false,
    unpriced: 0,
    hasNights: true,
    lastRun: null,
    weeksHeld: 0,
    nightsHeld: 0,
    ...over,
  });
  const best = (qualifies: boolean) => ({ best: { qualifies, low: 2, nights: 3, why: qualifies ? "best" : "above" } }) as Pick<DealRow, "best">;

  it("the Best filter keeps only rows that qualify", () => {
    const row = (qualifies: boolean) => ({ name: "x", aisle: "A", onSale: false, coupons: [], stacks: false, light: "new", ...best(qualifies) }) as unknown as DealRow;
    expect(matchesFilter(row(true), { ...NO_FILTER, kind: "best" })).toBe(true);
    expect(matchesFilter(row(false), { ...NO_FILTER, kind: "best" })).toBe(false);
    expect(matchesFilter(row(false), NO_FILTER)).toBe(true);
  });

  it("an empty Best says it needs 2 nights while no product has them", () => {
    const m = emptyMessage(board({ nightsHeld: 1 }), { ...NO_FILTER, kind: "best" });
    expect(m.title).toBe("No best deals yet");
    expect(m.body).toMatch(/at least 2 nights/);
  });

  it("an empty Best says nothing is at its low once there are nights to compare", () => {
    const m = emptyMessage(board({ nightsHeld: 12 }), { ...NO_FILTER, kind: "best" });
    expect(m.title).toBe("Nothing is at its low right now");
    expect(m.body).toMatch(/within 5%/);
    expect(m.body).toMatch(/12 weeks/);
  });

  it("with no store or no rows it says that instead, as every filter does", () => {
    expect(emptyMessage(board({ store: null }), { ...NO_FILTER, kind: "best" }).title).toBe("No store picked");
    expect(emptyMessage(board({ rows: [] }), { ...NO_FILTER, kind: "best" }).title).toBe("No recent prices");
  });
});
