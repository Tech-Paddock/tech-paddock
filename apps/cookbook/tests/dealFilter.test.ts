import { describe, expect, it } from "vitest";
import { NO_FILTER, coloursFrom, emptyMessage, matchesFilter, shortDay, type DealFilter } from "@/lib/dealFilter";
import { buildDealBoard, type DealBoard, type DealRow } from "@/lib/dealRows";

/**
 * Why a Deals filter is empty (TEC-190). The live board held two nights of
 * prices and no weekly roll-up, so every product was "new: building history"
 * and Green, Neutral and Red had nothing to show: the filter code was right,
 * and the screen did not say why. These tests hold the words and the date.
 */

const board = (over: Partial<DealBoard> = {}): DealBoard => ({
  store: "King Soopers Test",
  asOf: "2026-10-29",
  rows: [{ light: "new", weeks: 0 } as DealRow],
  couponsStaged: false,
  unpriced: 0,
  hasNights: true,
  lastRun: { first: "2026-10-27", last: "2026-10-28", recordedAt: "2026-10-28T09:04:00Z" },
  weeksHeld: 0,
  ...over,
});
const f = (over: Partial<DealFilter>): DealFilter => ({ ...NO_FILTER, ...over });

describe("when colours begin", () => {
  it("is the Monday run that adds the fourth week: from Thursday Oct 29 with no weeks, Nov 23", () => {
    expect(coloursFrom("2026-10-29", 0)).toBe("2026-11-23");
    expect(shortDay(coloursFrom("2026-10-29", 0))).toBe("Nov 23");
  });
  it("moves a week nearer with each week rolled up", () => {
    expect(coloursFrom("2026-11-04", 1)).toBe("2026-11-23");
    expect(coloursFrom("2026-11-18", 3)).toBe("2026-11-23");
  });
  it("on a Monday the day's run has happened, so the next is the following Monday", () => {
    expect(coloursFrom("2026-11-02", 0)).toBe("2026-11-30");
  });
  it("is today once there are four weeks", () => {
    expect(coloursFrom("2026-12-01", 4)).toBe("2026-12-01");
  });
});

describe("an empty filter says why", () => {
  it.each(["green", "neutral", "red"] as const)("%s before four weeks: colours start after 4 weeks, with the date, and offers New", (light) => {
    const m = emptyMessage(board(), f({ light }));
    expect(m.title).toBe(`No ${light} deals yet`);
    expect(m.body).toMatch(/start after 4 weeks of prices: about Nov 23\. Until then every product is New\./);
    expect(m.offerNew).toBe(true);
  });

  it("with history, a colour filter that finds none says so and does not blame the history", () => {
    const m = emptyMessage(board({ weeksHeld: 5 }), f({ light: "red" }));
    expect(m.title).toBe("Nothing is red right now");
    expect(m.offerNew).toBe(false);
  });

  it("New with every product coloured, On sale with none on sale, and coupons not staged each have their own sentence", () => {
    expect(emptyMessage(board({ weeksHeld: 6 }), f({ light: "new" })).title).toBe("Nothing is new");
    expect(emptyMessage(board(), f({ kind: "sale" })).title).toBe("Nothing is on sale");
    expect(emptyMessage(board(), f({ kind: "coupon" })).title).toBe("No coupons staged yet");
    expect(emptyMessage(board(), f({ kind: "stack" })).title).toBe("No coupons staged yet");
  });

  it("no store, no prices yet and no recent prices are told apart; a search that matches nothing is the last resort", () => {
    expect(emptyMessage(board({ store: null }), NO_FILTER).title).toBe("No store picked");
    expect(emptyMessage(board({ rows: [], hasNights: false }), NO_FILTER).title).toBe("No prices yet");
    expect(emptyMessage(board({ rows: [], hasNights: true }), NO_FILTER).title).toBe("No recent prices");
    expect(emptyMessage(board(), f({ query: "zzz" })).title).toBe("No deals match");
  });
});

describe("the filter itself, on a board built the way the live one was", () => {
  // Two nights, no weeks: the owner's board on 2026-10-29.
  const STORE = "62000001";
  const P = "0001111000001";
  const live = buildDealBoard({
    asOf: "2026-10-29",
    store: { locationId: STORE, name: "King Soopers Test" },
    products: [{ product_id: P, names: ["test cola"], description: "Test Cola", size: null, size_first: null, url: null, count: 0 } as never],
    nights: ["2026-10-27", "2026-10-28"].map((night) => ({ product_id: P, location_id: STORE, night, regular: 4, sale: 3, in_stock: true, aisle: "Drinks" })),
    weeks: [],
    coupons: [],
    couponsStaged: false,
    scan: null,
    span: { first: "2026-10-27", last: "2026-10-28", recordedAt: null },
  });

  it("every product is new, so Any and New show it and the three colours show nothing", () => {
    expect(live.rows).toHaveLength(1);
    expect(live.weeksHeld).toBe(0);
    expect(live.lastRun).toEqual({ first: "2026-10-27", last: "2026-10-28", recordedAt: null });
    const shown = (light: DealFilter["light"]) => live.rows.filter((r) => matchesFilter(r, f({ light }))).length;
    expect([shown("any"), shown("new"), shown("green"), shown("neutral"), shown("red")]).toEqual([1, 1, 0, 0, 0]);
  });

  it("On sale still works: the kind filter was never broken", () => {
    expect(live.rows.filter((r) => matchesFilter(r, f({ kind: "sale" })))).toHaveLength(1);
  });
});
