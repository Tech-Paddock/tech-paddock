// TEC-257: a Meal's and a Snuffle mat's amount is a Servings picklist in halves, in place of the cup scroller.
// A treat keeps its own count. Old entries are not converted.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LogForm from "@/app/LogForm";
import { describe as describeEvent, foodSnapshot, parseDetails, type FormKind, type JournalEvent } from "@/lib/events";
import { SERVING_OPTIONS, SERVING_UNIT, servingAmount, servingOptions, servingText } from "@/lib/foods";

const props = {
  people: [{ id: "p1", display_name: "Test" }],
  dogs: [],
  onAddDog: async () => ({ dog: null, error: null }),
  foods: [],
  onAddFood: async () => ({ food: null, error: null }),
  medications: [],
  onAddMedication: async () => ({ medication: null, error: null }),
  phonePerson: "p1",
  events: [] as JournalEvent[],
  photoUrls: {},
  onPhotoUrl: () => {},
  remembered: {},
  weightUnit: "lb" as const,
  onLog: () => {},
  onChange: async () => ({ error: null }),
  onUpcoming: async () => ({ error: null }),
  onPotty: () => {},
  unsaved: {},
  onRetry: () => {},
};
const render = (form: FormKind, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(LogForm, { ...props, form, ...extra } as never));
const selectOf = (html: string, id: string) => {
  const m = html.match(new RegExp(`<select[^>]*\\bid="${id}"[^>]*>.*?</select>`));
  expect(m, `#${id} is a select`).not.toBeNull();
  return m![0];
};

describe("the Servings picklist", () => {
  it("offers ½ to 4 in halves, in order", () => {
    expect([...SERVING_OPTIONS]).toEqual([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]);
    expect(SERVING_OPTIONS.map(servingText)).toEqual(["½", "1", "1½", "2", "2½", "3", "3½", "4"]);
  });
  it("slots in an amount a correction opened on that is not a half, so an untouched one keeps it", () => {
    expect(servingOptions(null, 0.5)).toEqual([...SERVING_OPTIONS]);
    expect(servingOptions(0.375, 6)).toEqual([0.375, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 6]);
  });
  it("opens a new meal on a listed remembered amount, else one serving", () => {
    expect(servingAmount(2.5)).toBe(2.5);
    expect(servingAmount(0.375)).toBe(1);
    expect(servingAmount(null)).toBe(1);
  });
  it("is a plain select on the Food form for a meal, a fixed width, with the shared field class", () => {
    const sel = selectOf(render("food"), "f-amount");
    expect(sel).toContain("w-[64px]");
    expect(sel).not.toMatch(/w-auto|w-full|w-1\/2/);
    expect(sel).toContain("min-h-[44px]");
    for (const t of ["½", "1½", "4"]) expect(sel).toContain(`>${t}</option>`);
    expect(sel).toContain('<option value="1" selected');
    expect(render("food")).toContain("Servings");
  });
  it("is gone on a treat, which keeps its own count box", () => {
    const treat = render("food", { quick: { form: "food", itemId: null, amount: null, type: "treat" } });
    expect(treat).not.toMatch(/<select[^>]*id="f-amount"/);
    expect(treat).toContain("Amount");
    expect(treat).not.toContain("Servings");
  });
});

describe("the unit a meal or a snuffle mat is stored and shown in", () => {
  it("is serving for a new meal or snuffle mat, whatever the food's own unit; a treat keeps its unit", () => {
    expect(SERVING_UNIT).toBe("serving");
    expect(foodSnapshot("meal", "royal-canin-dachshund-puppy", 1.5).unit).toBe("serving");
    expect(foodSnapshot("snuffle", "royal-canin-dachshund-puppy", 0.5).unit).toBe("serving");
    expect(foodSnapshot("meal", "misc", null).unit).toBe("serving");
    expect(foodSnapshot("treat", "freeze-dried-beef-hearts", 2).unit).not.toBe("serving");
  });
  it("is accepted by the stored shape: halves are valid amounts", () => {
    for (const a of SERVING_OPTIONS) expect(parseDetails("food", { type: "meal", item_id: "misc", amount: a })).toMatchObject({ amount: a });
  });
  it("reads serving at one or less and servings above it", () => {
    const row = (amount: number) =>
      describeEvent({ kind: "food", details: { type: "meal", item_id: "x", item_name: "Kibble", kcal_per: null, unit: "serving", amount } }).detail;
    expect(row(0.5)).toBe("Kibble · 1/2 serving");
    expect(row(1)).toBe("Kibble · 1 serving");
    expect(row(1.5)).toBe("Kibble · 1 1/2 servings");
    expect(row(4)).toBe("Kibble · 4 servings");
  });
  it("leaves an old meal logged in cups as it was", () => {
    const old = describeEvent({ kind: "food", details: { type: "meal", item_id: "x", item_name: "Kibble", kcal_per: 447, unit: "cup", amount: 0.375 } });
    expect(old.detail).toBe("Kibble · 3/8 cup");
  });
});
