// TEC-193: the bar without Meals today, the portion scroller's window, the treat entries behind a form and the
// commands picklist. The inline treat row (a pick beside a quantity) became a count in TEC-199, so its layout
// tests moved to boxedforms.test.ts.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AppBar from "@/app/AppBar";
import AmountScroller from "@/app/AmountScroller";
import { COMMANDS, InvalidEvent, inlineTreatEntries, parseDetails, type JournalEvent } from "@/lib/events";
import { amountOptions, type AddedFood } from "@/lib/foods";
import { SCROLLER_ROW, SCROLLER_WIDTH, scrollerWindow } from "@/lib/scroller";
import { saveThen } from "@/lib/saveOrder";

const ID = "44444444-4444-4444-8444-444444444444";
const AT = "2026-10-29T12:00:00.123Z";
const PERSON = "55555555-5555-4555-8555-555555555555";
const ADDED: AddedFood[] = [{ id: "cheese-bits", type: "treat", name: "Cheese bits", kcalPer: 3, unit: "piece" }];

describe("the app bar", () => {
  it("holds the name, theme, logout and the livery badge, and no Meals today", () => {
    const html = renderToStaticMarkup(createElement(AppBar));
    expect(html).toContain("Lando");
    expect(html).not.toMatch(/Meals today/i);
  });
});

describe("the portion scroller's window", () => {
  const w = scrollerWindow();
  it("is two rows tall: the pick in full with half a row of each neighbour", () => {
    expect(w.height).toBe(SCROLLER_ROW * 2);
    expect(w.bandHeight).toBe(SCROLLER_ROW);
    expect(w.above).toBe(0.5);
    expect(w.below).toBe(0.5);
    // The pick's band starts after the half row above and ends before the half row below.
    expect(w.bandTop + w.bandHeight + w.below * SCROLLER_ROW).toBe(w.height);
    // Either end of the list can sit in the middle.
    expect(w.pad).toBe(SCROLLER_ROW / 2);
  });
  it("is shorter and thinner than the old three-row, 120px box", () => {
    expect(w.height).toBeLessThan(120);
    expect(SCROLLER_WIDTH).toBeLessThan(120);
  });
  it("renders that size, with the same values and steps", () => {
    const options = amountOptions(null, null);
    const html = renderToStaticMarkup(createElement(AmountScroller, { options, value: 0.5, onChange: () => {}, label: "Amount" }));
    expect(html).toContain(`height:${w.height}px`);
    expect(html).toContain(`max-width:${SCROLLER_WIDTH}px`);
    expect(options.slice(0, 4)).toEqual([null, 0.125, 0.25, 0.375]);
  });
});

describe("the inline treat entries", () => {
  it("are none at quantity 0 or with no quantity", () => {
    expect(inlineTreatEntries({ id: ID, item_id: "misc", qty: 0 }, AT, PERSON)).toEqual([]);
    expect(inlineTreatEntries({ id: ID, item_id: "misc", qty: null }, AT, PERSON)).toEqual([]);
  });
  it("are one treat entry at the parent's time and person, with the picked quantity", () => {
    const [e, ...rest] = inlineTreatEntries({ id: ID, item_id: "freeze-dried-beef-hearts", qty: 3 }, AT, PERSON);
    expect(rest).toEqual([]);
    expect(e).toMatchObject({ id: ID, kind: "food", at: AT, person_id: PERSON, note: null });
    expect(e.details).toMatchObject({ type: "treat", item_id: "freeze-dried-beef-hearts", amount: 3, unit: "piece" });
  });
  it("include a food added in the app", () => {
    const [e] = inlineTreatEntries({ id: ID, item_id: "cheese-bits", qty: 2 }, AT, null, ADDED);
    expect(e.details).toMatchObject({ type: "treat", item_id: "cheese-bits", item_name: "Cheese bits", amount: 2 });
    expect(() => inlineTreatEntries({ id: ID, item_id: "cheese-bits", qty: 2 }, AT, null)).toThrow(InvalidEvent);
  });
  it("refuse a quantity that is not a whole number of 1 or more", () => {
    for (const qty of [-1, 1.5]) expect(() => inlineTreatEntries({ id: ID, item_id: "misc", qty }, AT, null)).toThrow(InvalidEvent);
  });
  it("are saved only after the entry they go with, and not at all if that fails", async () => {
    const order: string[] = [];
    const treats = inlineTreatEntries({ id: ID, item_id: "misc", qty: 1 }, AT, null);
    const ok = await saveThen(
      async () => (order.push("parent"), true),
      () => void order.push("treat"),
      "potty",
      treats.map(() => "treat")
    );
    expect(ok).toBe(true);
    expect(order).toEqual(["parent", "treat"]);

    const saveNext = vi.fn();
    expect(await saveThen(async () => false, saveNext, "potty", ["treat"])).toBe(false);
    expect(saveNext).not.toHaveBeenCalled();
  });
});

describe("commands from the picklist", () => {
  it("are stored as before: the picked ids, in the list's order, nothing else", () => {
    const base = { type: "training", where: "inside", with_dogs: false, minutes: 10, treats: 0 };
    expect(parseDetails("exercise", { ...base, commands: ["heel", "sit", "potty-bell"] })).toEqual({
      ...base,
      commands: ["sit", "potty-bell", "heel"],
    });
    expect(parseDetails("exercise", { ...base, commands: [] })).toEqual({ ...base, commands: [] });
  });
});
