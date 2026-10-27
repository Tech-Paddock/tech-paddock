import { describe, expect, it } from "vitest";
import { formatGap, mealGapText, mealGaps, type JournalEvent } from "@/lib/events";

// Invented ids. Nothing here is a real person or a real dog's record.
let n = 0;
const uuid = () => `00000000-0000-4000-9000-${String(++n).padStart(12, "0")}`;

function ev(over: Partial<JournalEvent> & Pick<JournalEvent, "kind" | "at">): JournalEvent {
  return { id: uuid(), person_id: null, details: {}, note: null, voids: null, created_at: over.at, ...over };
}
const potty = (at: string, what: string, where = "outside") => ev({ kind: "potty", at, details: { what, where } });
const meal = (at: string) =>
  ev({ kind: "food", at, details: { type: "meal", item_id: "misc", item_name: "Misc", kcal_per: null, unit: null, amount: null } });
const treat = (at: string) =>
  ev({ kind: "food", at, details: { type: "treat", item_id: "misc", item_name: "Misc", kcal_per: null, unit: null, amount: 1 } });

const NOW = new Date("2026-10-20T15:00:00Z");
const MIN = 60_000;

describe("mealGaps — meal to pee, meal to poop, meal to meal (TEC-172)", () => {
  it("measures the latest meal to the first pee and the first poop after it", () => {
    const out = mealGaps(
      [
        meal("2026-10-20T08:00:00Z"),
        potty("2026-10-20T08:40:00Z", "pee"),
        potty("2026-10-20T09:10:00Z", "pee"),
        potty("2026-10-20T09:30:00Z", "poop"),
      ],
      NOW
    );
    expect(out.pee).toEqual({ state: "gap", ms: 40 * MIN });
    expect(out.poop).toEqual({ state: "gap", ms: 90 * MIN });
  });

  it("counts both for each, and an accident inside as a pee", () => {
    const both = mealGaps([meal("2026-10-20T08:00:00Z"), potty("2026-10-20T08:20:00Z", "both")], NOW);
    expect(both.pee).toEqual({ state: "gap", ms: 20 * MIN });
    expect(both.poop).toEqual({ state: "gap", ms: 20 * MIN });
    const inside = mealGaps([meal("2026-10-20T08:00:00Z"), potty("2026-10-20T08:25:00Z", "pee", "inside")], NOW);
    expect(inside.pee).toEqual({ state: "gap", ms: 25 * MIN });
  });

  it("ignores a No potty", () => {
    const out = mealGaps([meal("2026-10-20T08:00:00Z"), potty("2026-10-20T08:10:00Z", "none")], NOW);
    expect(out.pee).toEqual({ state: "pending" });
    expect(out.poop).toEqual({ state: "pending" });
  });

  it("says not yet when nothing followed the latest meal, and never borrows an older meal", () => {
    const out = mealGaps(
      [
        meal("2026-10-20T06:00:00Z"),
        potty("2026-10-20T06:30:00Z", "pee"),
        potty("2026-10-20T06:45:00Z", "poop"),
        meal("2026-10-20T12:00:00Z"),
      ],
      NOW
    );
    expect(out.pee).toEqual({ state: "pending" });
    expect(out.poop).toEqual({ state: "pending" });
  });

  it("does not count a pee before the latest meal", () => {
    const out = mealGaps([potty("2026-10-20T07:00:00Z", "pee"), meal("2026-10-20T08:00:00Z")], NOW);
    expect(out.pee).toEqual({ state: "pending" });
  });

  it("measures meal to meal from the last two meals", () => {
    const out = mealGaps([meal("2026-10-20T04:00:00Z"), meal("2026-10-20T08:00:00Z"), meal("2026-10-20T13:00:00Z")], NOW);
    expect(out.food).toEqual({ state: "gap", ms: 5 * 60 * MIN });
  });

  it("shows nothing for meal to meal with one meal only, and nothing at all with none", () => {
    const one = mealGaps([meal("2026-10-20T08:00:00Z")], NOW);
    expect(one.food).toEqual({ state: "none" });
    expect(one.pee).toEqual({ state: "pending" });
    const none = mealGaps([potty("2026-10-20T08:00:00Z", "pee")], NOW);
    expect(none).toEqual({ pee: { state: "none" }, poop: { state: "none" }, food: { state: "none" } });
  });

  it("never counts a treat as a meal", () => {
    const out = mealGaps(
      [meal("2026-10-20T08:00:00Z"), treat("2026-10-20T10:00:00Z"), potty("2026-10-20T10:30:00Z", "pee"), treat("2026-10-20T11:00:00Z")],
      NOW
    );
    expect(out.pee).toEqual({ state: "gap", ms: 150 * MIN });
    expect(out.food).toEqual({ state: "none" });
  });

  it("leaves out voided entries and ignores times in the future", () => {
    const wrong = potty("2026-10-20T08:10:00Z", "pee");
    const del = ev({ kind: "void", at: "2026-10-20T08:20:00Z", voids: wrong.id });
    const out = mealGaps(
      [meal("2026-10-20T08:00:00Z"), wrong, del, potty("2026-10-20T16:00:00Z", "pee"), meal("2026-10-20T18:00:00Z")],
      NOW
    );
    expect(out.pee).toEqual({ state: "pending" });
    expect(out.food).toEqual({ state: "none" });
  });

  it("uses a correction in place of the meal it replaces", () => {
    const first = meal("2026-10-20T08:00:00Z");
    const fix = ev({ ...meal("2026-10-20T07:30:00Z"), voids: first.id });
    const out = mealGaps([first, fix, potty("2026-10-20T08:00:00Z", "pee")], NOW);
    expect(out.pee).toEqual({ state: "gap", ms: 30 * MIN });
  });
});

describe("mealGapText", () => {
  it("is null when there is nothing to say", () => {
    expect(mealGapText("pee", { state: "none" })).toBeNull();
    expect(mealGapText("food", { state: "none" })).toBeNull();
  });

  it("spells a gap short for the pill and in words for a screen reader", () => {
    expect(mealGapText("pee", { state: "gap", ms: 40 * MIN })).toEqual({
      short: "meal→ 40m",
      words: "First pee came 40m after the latest meal",
    });
    expect(mealGapText("poop", { state: "gap", ms: 125 * MIN })?.short).toBe("meal→ 2h 5m");
    expect(mealGapText("food", { state: "gap", ms: 250 * MIN })).toEqual({
      short: "gap 4h 10m",
      words: "4h 10m between the last two meals",
    });
  });

  it("says not yet", () => {
    expect(mealGapText("poop", { state: "pending" })).toEqual({ short: "not yet", words: "No poop since the latest meal yet" });
  });

  it("keeps the longest line short enough for a quarter of a phone", () => {
    expect(mealGapText("poop", { state: "gap", ms: 9 * 60 * MIN + 59 * MIN })?.short).toBe("meal→ 9h 59m");
    expect(mealGapText("food", { state: "gap", ms: 30 * 60 * MIN })?.short.length).toBeLessThanOrEqual(12);
  });
});

describe("formatGap", () => {
  it("reads under a minute as <1m and otherwise like the pills", () => {
    expect(formatGap(0)).toBe("<1m");
    expect(formatGap(59_000)).toBe("<1m");
    expect(formatGap(47 * MIN)).toBe("47m");
    expect(formatGap(14 * 60 * MIN)).toBe("14h");
  });
});
