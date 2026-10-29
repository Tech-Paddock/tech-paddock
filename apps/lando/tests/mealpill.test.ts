// TEC-194: the Meal pill reads today's meals and the cups eaten, in 1/8-cup steps.
import { describe, expect, it } from "vitest";
import { cupsWord, formatCups, mealPillLabel, mealsSummary, type JournalEvent } from "@/lib/events";

// Invented ids. Nothing here is a real person or a real dog's record.
let n = 0;
const uuid = () => `00000000-0000-4000-c000-${String(++n).padStart(12, "0")}`;
const NOW = new Date(2026, 9, 29, 18, 0, 0); // the phone's evening, local time
const at = (h: number, day = 29) => new Date(2026, 9, day, h, 0, 0).toISOString();

function ev(over: Partial<JournalEvent> & Pick<JournalEvent, "kind" | "at">): JournalEvent {
  return { id: uuid(), person_id: null, details: {}, note: null, voids: null, created_at: over.at, ...over };
}
function food(when: string, type: "meal" | "treat", unit: string | null, amount: number | null): JournalEvent {
  return ev({
    kind: "food",
    at: when,
    details: { type, item_id: "x", item_name: "Invented food", kcal_per: null, unit, amount },
  });
}
const meal = (h: number, amount: number | null, unit: string | null = "cup", day = 29) => food(at(h, day), "meal", unit, amount);
const voidOf = (e: JournalEvent): JournalEvent => ev({ kind: "void", at: e.at, voids: e.id });

describe("formatCups", () => {
  it("rounds to the nearest eighth and writes a mixed fraction", () => {
    expect(formatCups(0.125)).toBe("⅛");
    expect(formatCups(0.25)).toBe("¼");
    expect(formatCups(0.375)).toBe("⅜");
    expect(formatCups(0.5)).toBe("½");
    expect(formatCups(0.625)).toBe("⅝");
    expect(formatCups(0.75)).toBe("¾");
    expect(formatCups(0.875)).toBe("⅞");
    expect(formatCups(1)).toBe("1");
    expect(formatCups(1.125)).toBe("1⅛");
    expect(formatCups(2)).toBe("2");
    expect(formatCups(2.5)).toBe("2½");
  });

  it("rounds off-step amounts, and a third reads as ⅜", () => {
    expect(formatCups(1 / 3)).toBe("⅜");
    expect(formatCups(0.9)).toBe("⅞");
    expect(formatCups(1.06)).toBe("1");
    expect(formatCups(0.01)).toBe("⅛"); // never "0 cups"
  });

  it("is singular at one or less and plural above", () => {
    expect(cupsWord(0.125)).toBe("cup");
    expect(cupsWord(0.875)).toBe("cup");
    expect(cupsWord(1)).toBe("cup");
    expect(cupsWord(1.125)).toBe("cups");
    expect(cupsWord(2)).toBe("cups");
    expect(cupsWord(1.04)).toBe("cup"); // rounds to 1
  });
});

describe("mealsSummary and mealPillLabel", () => {
  it("counts today's meals and sums their cups", () => {
    const events = [meal(7, 0.5), meal(12, 0.625)];
    expect(mealsSummary(events, NOW)).toEqual({ count: 2, cups: 1.125 });
    expect(mealPillLabel(events, NOW)).toBe("Meals: 2 · 1⅛ cups");
  });

  it("reads singular at one cup or less", () => {
    expect(mealPillLabel([meal(7, 0.875)], NOW)).toBe("Meals: 1 · ⅞ cup");
    expect(mealPillLabel([meal(7, 0.5), meal(12, 0.5)], NOW)).toBe("Meals: 2 · 1 cup");
    expect(mealPillLabel([meal(7, 1), meal(12, 1)], NOW)).toBe("Meals: 2 · 2 cups");
  });

  it("leaves voided meals out of both numbers", () => {
    const a = meal(7, 0.5);
    const b = meal(12, 0.25);
    expect(mealPillLabel([a, b, voidOf(b)], NOW)).toBe("Meals: 1 · ½ cup");
  });

  it("never counts treats", () => {
    const events = [meal(7, 0.5), food(at(9), "treat", "treat", 2), food(at(10), "treat", "cup", 0.5)];
    expect(mealPillLabel(events, NOW)).toBe("Meals: 1 · ½ cup");
  });

  it("counts a meal in another unit, or Misc with no amount, toward N but not X", () => {
    const events = [meal(7, 0.5), meal(12, 20, "gram"), meal(15, 1, "scoop"), meal(16, null, null)];
    expect(mealsSummary(events, NOW)).toEqual({ count: 4, cups: 0.5 });
    expect(mealPillLabel(events, NOW)).toBe("Meals: 4 · ½ cup");
  });

  it("reads just the count when no meal has a cup amount", () => {
    expect(mealPillLabel([meal(7, 20, "gram"), meal(12, null, null)], NOW)).toBe("Meals: 2");
  });

  it("counts a Snuffle mat (a cup meal) toward both", () => {
    expect(mealPillLabel([meal(7, 0.5), meal(9, 0.25, "cup")], NOW)).toBe("Meals: 2 · ¾ cup");
  });

  it("reads Meals: 0 on a day with no meals", () => {
    expect(mealPillLabel([], NOW)).toBe("Meals: 0");
    expect(mealPillLabel([food(at(9), "treat", "treat", 1)], NOW)).toBe("Meals: 0");
  });

  it("looks at the phone's day only", () => {
    const events = [meal(7, 0.5, "cup", 28), meal(23, 0.5, "cup", 28), meal(7, 0.25), meal(7, 0.5, "cup", 30)];
    expect(mealPillLabel(events, NOW)).toBe("Meals: 1 · ¼ cup");
    // The first moment of the day counts; the last moment of yesterday does not.
    const midnight = ev({ kind: "food", at: new Date(2026, 9, 29, 0, 0, 0).toISOString(), details: { type: "meal", unit: "cup", amount: 1 } });
    const before = ev({ kind: "food", at: new Date(2026, 9, 28, 23, 59, 59).toISOString(), details: { type: "meal", unit: "cup", amount: 1 } });
    expect(mealsSummary([midnight, before], NOW)).toEqual({ count: 1, cups: 1 });
  });

  it("ignores other kinds of entry", () => {
    const pee = ev({ kind: "potty", at: at(8), details: { pee: true } });
    expect(mealPillLabel([pee], NOW)).toBe("Meals: 0");
  });
});
