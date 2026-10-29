// TEC-193: the bar without Meals today, the portion scroller's window, Training's field order, the inline
// treat row on Training and Potty, and the commands picklist.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AppBar from "@/app/AppBar";
import LogForm from "@/app/LogForm";
import TreatRow from "@/app/TreatRow";
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

const formProps = {
  people: [],
  dogs: [],
  onAddDog: async () => ({ dog: null, error: null }),
  foods: ADDED,
  onAddFood: async () => ({ food: null, error: null }),
  phonePerson: null,
  events: [] as JournalEvent[],
  photoUrls: {},
  onPhotoUrl: () => {},
  remembered: {},
  weightUnit: "lb" as const,
  onLog: () => {},
  onChange: async () => ({ error: null }),
  onPotty: () => {},
  unsaved: {},
  onRetry: () => {},
};
const render = (form: "training" | "potty" | "fun") => renderToStaticMarkup(createElement(LogForm, { form, ...formProps }));
const at = (html: string, needle: string) => {
  const i = html.indexOf(needle);
  expect(i, `${needle} is in the form`).toBeGreaterThanOrEqual(0);
  return i;
};

describe("Training's layout", () => {
  const html = render("training");
  it("puts Time on the top row, beside Inside/Outside, before Other dogs", () => {
    expect(at(html, "Where")).toBeLessThan(at(html, "Time (min)"));
    expect(at(html, "Time (min)")).toBeLessThan(at(html, "Other dogs"));
    // The same row: nothing between the two but the Where chips and the Time field.
    const row = html.slice(at(html, "Where") - 200, at(html, "Time (min)"));
    expect(row).not.toContain("Other dogs");
    expect(html).not.toContain("Length (min)");
  });
  it("has the inline treat row (pick beside quantity) after Other dogs, then the commands", () => {
    expect(at(html, "Other dogs")).toBeLessThan(at(html, "f-treat-item"));
    expect(at(html, "f-treat-item")).toBeLessThan(at(html, "f-treat-qty"));
    expect(at(html, "f-treat-qty")).toBeLessThan(at(html, "Commands practised"));
    expect(html).not.toContain("+ Treat");
    expect(html).toContain("Cheese bits");
  });
  it("opens the treat quantity on 0, so an untouched form logs no treat", () => {
    expect(html).toMatch(/id="f-treat-qty"[^>]*value="0"/);
  });
  it("offers the commands as one multi-select over the fixed list, not chips", () => {
    const sel = html.slice(at(html, 'id="f-commands"'));
    expect(sel.slice(0, sel.indexOf("</select>"))).toContain("multiple");
    for (const [id, text] of COMMANDS) expect(sel).toContain(`value="${id}">${text}</option>`);
    expect(html).not.toMatch(/type="checkbox"[^>]*>[^<]*<span[^>]*>Sit</);
  });
});

describe("Potty's treat row", () => {
  it("sits right below Time outside, before the medical issue", () => {
    const html = render("potty");
    expect(at(html, "Time outside")).toBeLessThan(at(html, "f-treat-item"));
    expect(at(html, "f-treat-item")).toBeLessThan(at(html, "Medical issue"));
    // Nothing but the chips of Time outside sits between them.
    expect(html.slice(at(html, "Time outside"), at(html, "f-treat-item"))).not.toMatch(/Leash|Spot|Medical/);
  });
  it("is not on Fun, which keeps its Length and Treats used boxes", () => {
    const html = render("fun");
    expect(html).not.toContain("f-treat-item");
    expect(html).toContain("Treats used");
    expect(html).toContain("Length (min)");
  });
  it("renders the shared row with a label and unit", () => {
    const html = renderToStaticMarkup(createElement(TreatRow, { foods: ADDED, item: "cheese-bits", qty: 2, onItem: () => {}, onQty: () => {} }));
    expect(html).toContain("Qty (pieces)");
    expect(html).toContain("Cheese bits");
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
