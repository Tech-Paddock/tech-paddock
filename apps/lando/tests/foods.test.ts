import { describe, expect, it } from "vitest";
import { FOODS, MISC_ID, formatAmount, parseAmount, picklist } from "@/lib/foods";
import { defaultAmount, defaultFood } from "@/lib/defaults";

describe("the catalogue", () => {
  it("is the owner's list: one meal and three treats, Misc last in each, nothing else", () => {
    expect(picklist("meal").map((f) => f.id)).toEqual(["purina-pro-plan-toy-puppy-chicken-rice", MISC_ID]);
    expect(picklist("treat").map((f) => f.id)).toEqual([
      "freeze-dried-beef-hearts",
      "woof-pupsicle-refill-pop-small",
      "bixbi-pocket-trainers-bacon",
      MISC_ID,
    ]);
  });

  it("gives every named item calories and a unit, and Misc neither", () => {
    for (const list of Object.values(FOODS))
      for (const f of list) {
        if (f.id === MISC_ID) expect([f.kcalPer, f.unit]).toEqual([null, null]);
        else expect(f.kcalPer! > 0 && !!f.unit).toBe(true);
        // The database refuses any other id shape.
        expect(f.id).toMatch(/^[a-z0-9-]{1,60}$/);
      }
  });
});

describe("amounts", () => {
  it.each([
    ["2", 2],
    ["0.5", 0.5],
    ["0,5", 0.5],
    [".25", 0.25],
    ["1/3", 0.333],
    ["1 1/2", 1.5],
    ["", null],
    ["lots", null],
    ["0", null],
    ["1/0", null],
  ])("reads %j as %s", (raw, want) => {
    expect(parseAmount(raw)).toBe(want);
  });

  it.each([
    [0.333, "1/3"],
    [0.5, "1/2"],
    [1.5, "1 1/2"],
    [2, "2"],
    [0.4, "0.4"],
  ])("shows %s as %s", (n, want) => {
    expect(formatAmount(n)).toBe(want);
  });
});

describe("form defaults", () => {
  it("opens on Misc on a phone's first log", () => {
    expect(defaultFood("meal", {})).toBe(MISC_ID);
    expect(defaultFood("treat", {})).toBe(MISC_ID);
    expect(defaultAmount("meal", {})).toBeNull();
  });

  it("opens on the last item and meal amount this phone used", () => {
    const r = { meal: "purina-pro-plan-toy-puppy-chicken-rice", treat: "bixbi-pocket-trainers-bacon", mealAmount: 0.333 };
    expect(defaultFood("meal", r)).toBe(r.meal);
    expect(defaultFood("treat", r)).toBe(r.treat);
    expect(defaultAmount("meal", r)).toBe(0.333);
    expect(defaultAmount("treat", r)).toBe(1);
  });

  it("falls back to Misc when the remembered item has left the list", () => {
    expect(defaultFood("treat", { treat: "gone" })).toBe(MISC_ID);
  });
});
