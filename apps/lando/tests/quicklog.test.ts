import { describe, expect, it } from "vitest";
import { CLOCKS, CLOCK_LABELS, TREAT_QUICK_LOG, quickLog, sinceLast, type JournalEvent } from "@/lib/events";

// Invented ids. Nothing here is a real person or a real dog's record.
let n = 0;
const uuid = () => `00000000-0000-4000-a000-${String(++n).padStart(12, "0")}`;
function ev(over: Partial<JournalEvent> & Pick<JournalEvent, "kind" | "at">): JournalEvent {
  return { id: uuid(), person_id: null, details: {}, note: null, voids: null, created_at: over.at, ...over };
}
const food = (at: string, type: "meal" | "treat", item_id: string, amount: number | null) =>
  ev({ kind: "food", at, details: { type, item_id, item_name: item_id, kcal_per: null, unit: null, amount } });

const NOW = new Date("2026-10-27T15:00:00Z");
const MEAL = "purina-pro-plan-toy-puppy-chicken-rice";
const lastMeal = (events: JournalEvent[]) => sinceLast(events, NOW).food;

describe("quickLog — what a tapped pill opens (TEC-181)", () => {
  it("labels the food pill Meal", () => {
    expect(CLOCK_LABELS.food).toBe("Meal");
  });

  it("Pee and Poop open Potty on that what (the form defaults give outside, leashed)", () => {
    expect(quickLog("pee", null)).toEqual({ form: "potty", what: "pee" });
    expect(quickLog("poop", null)).toEqual({ form: "potty", what: "poop" });
  });

  it("Fun opens the Fun form on a new entry, and every pill is tappable (TEC-186)", () => {
    expect(CLOCK_LABELS.exercise).toBe("Fun");
    expect(quickLog("exercise", null)).toEqual({ form: "fun" });
    expect(CLOCKS.filter((c) => quickLog(c, null))).toEqual(["pee", "poop", "food", "exercise"]);
  });

  it("the Treats button opens Food on a treat, with the meal/treat choice left in the form (TEC-186)", () => {
    expect(TREAT_QUICK_LOG).toEqual({ form: "food", itemId: null, amount: null, type: "treat" });
  });

  it("Meal opens Food on the last meal's item and amount", () => {
    const events = [food("2026-10-27T08:00:00Z", "meal", "misc", 1), food("2026-10-27T12:00:00Z", "meal", MEAL, 0.75)];
    expect(quickLog("food", lastMeal(events))).toEqual({ form: "food", itemId: MEAL, amount: 0.75 });
  });

  it("skips a later treat: the last meal still sets the prefill", () => {
    const events = [
      food("2026-10-27T12:00:00Z", "meal", MEAL, 0.75),
      food("2026-10-27T13:30:00Z", "treat", "freeze-dried-beef-hearts", 2),
    ];
    expect(quickLog("food", lastMeal(events))).toEqual({ form: "food", itemId: MEAL, amount: 0.75 });
  });

  it("falls back to the form's usual defaults with no meal, only treats, or an item no longer listed", () => {
    const usual = { form: "food", itemId: null, amount: null };
    expect(quickLog("food", lastMeal([]))).toEqual(usual);
    expect(quickLog("food", lastMeal([food("2026-10-27T13:00:00Z", "treat", "freeze-dried-beef-hearts", 1)]))).toEqual(usual);
    expect(quickLog("food", lastMeal([food("2026-10-27T13:00:00Z", "meal", "gone-brand", 1)]))).toEqual(usual);
  });
});
