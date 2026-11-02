// TEC-199: boxed, compact forms; one Potty button; treat counts; the Medication tab; future entries; three tabs.
// The forms and the Log screen are rendered to markup (there is no DOM in these tests), so what is asserted is
// what is on the screen when it opens; the save paths are held by the pure functions they call.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import LogForm from "@/app/LogForm";
import Journal from "@/app/Journal";
import TreatCount from "@/app/TreatCount";
import UpcomingList from "@/app/UpcomingList";
import {
  InvalidEvent,
  checkHealthReasons,
  describe as describeEvent,
  inlineTreatEntries,
  parseDetails,
  parseNewEvent,
  parseNewMedication,
  type FormKind,
  type HealthType,
  type JournalEvent,
} from "@/lib/events";
import { MISC_ID } from "@/lib/foods";
import { MED_ROUTES, MED_UNITS, doseText, findMedication, medNameTaken, medPicklist, type Medication } from "@/lib/medications";
import { saveThen } from "@/lib/saveOrder";
import type { Upcoming } from "@/lib/upcoming";
import {
  allUpcoming,
  donePrefill,
  doneWhen,
  formForItem,
  futureItem,
  futureTitle,
  isFutureDay,
  isFutureWhen,
  nextWeek,
} from "@/lib/future";
import { writeEvent, addMedication, listMedications } from "@/lib/journal";

// Invented ids and names. Nothing here is a real record (RULES.md, Never 2).
const MED: Medication = { id: "11111111-1111-4111-8111-111111111111", name: "Test Tablet", unit: "tablet" };
const OLD: Medication = { id: "22222222-2222-4222-8222-222222222222", name: "Old Syrup", unit: "ml", retired: true };
const MEDS = [MED, OLD];
const ISSUE_ID = "33333333-3333-4333-8333-333333333333";
const AT = "2026-11-01T15:00:00.000Z";

const formProps = {
  people: [],
  dogs: [],
  onAddDog: async () => ({ dog: null, error: null }),
  foods: [],
  onAddFood: async () => ({ food: null, error: null }),
  medications: MEDS,
  onAddMedication: async () => ({ medication: null, error: null }),
  phonePerson: null,
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
  renderToStaticMarkup(createElement(LogForm, { ...formProps, form, ...extra } as never));
const at = (html: string, needle: string) => {
  const i = html.indexOf(needle);
  expect(i, `${needle} is in the form`).toBeGreaterThanOrEqual(0);
  return i;
};
const sections = (html: string) => [...html.matchAll(/data-section="([a-z]+)"/g)].map((m) => m[1]);

/* ── One form layout everywhere ─────────────────────────────────────────── */

describe("section order per form", () => {
  const ORDER = ["when", "entry", "secondary", "note", "photos", "save"];
  const cases: [string, FormKind, Record<string, unknown>, string[]][] = [
    ["Potty", "potty", {}, ORDER],
    ["Training", "training", {}, ORDER],
    ["Fun", "fun", {}, ORDER],
    ["Vet visit", "health", { healthType: "vet" }, ORDER],
    ["Medical issue", "health", { healthType: "issue" }, ["when", "entry", "note", "photos", "save"]],
    ["Medication", "health", { healthType: "medication" }, ["when", "entry", "note", "photos", "save"]],
    // Photos and files are on every form (TEC-203).
    ["Food", "food", {}, ["when", "entry", "note", "photos", "save"]],
    ["Weight", "weight", {}, ["when", "entry", "note", "photos", "save"]],
  ];
  for (const [name, form, extra, expected] of cases) {
    it(`${name}: When and Logging as, the entry, the secondary box, the note, photos, then Save last`, () => {
      expect(sections(render(form, extra))).toEqual(expected);
    });
  }

  it("puts When and Logging as on one line, in the first box", () => {
    const html = render("potty");
    const first = html.slice(at(html, 'data-section="when"'), at(html, 'data-section="entry"'));
    expect(first).toContain("When");
    expect(first).toContain("Logging as");
    expect(html).not.toContain(">Human<");
  });

  it("makes the note a full-width text box of two lines, with photos under it", () => {
    const html = render("training");
    const note = html.slice(at(html, 'id="f-note"') - 40, at(html, "</textarea>"));
    expect(note).toContain("<textarea");
    expect(note).toContain('rows="2"');
    expect(at(html, 'id="f-note"')).toBeLessThan(at(html, 'data-section="photos"'));
  });

  it("drops the Potty form's helper text", () => {
    const html = render("potty");
    expect(html).not.toContain("Defaults are filled in");
    expect(html).not.toContain("Inside counts as an accident");
  });
});

describe("Potty", () => {
  it("opens with no What picked", () => {
    const html = render("potty");
    const what = html.slice(at(html, 'aria-label="What"'), at(html, 'aria-label="Where"'));
    expect(what).toContain('type="radio"');
    expect(what).not.toMatch(/checked=""/);
    for (const w of ["Pee", "Poop", "Both", "No potty"]) expect(what).toContain(w);
  });
  it("won't save without a What: the server and the form both refuse it", () => {
    expect(() => parseDetails("potty", { what: "", where: "outside" })).toThrow(InvalidEvent);
    expect(readFileSync(resolve(__dirname, "../app/LogForm.tsx"), "utf8")).toMatch(/kind === "potty" && !what\) \{\s+setError\("Pick what happened/);
  });
  it("puts Where and Leash on one line, then Time outside, and the treats count beside Medical issue", () => {
    const html = render("potty");
    const entry = html.slice(at(html, 'data-section="entry"'), at(html, 'data-section="secondary"'));
    expect(entry.indexOf("Where")).toBeLessThan(entry.indexOf("Leash"));
    // One flex row holds both fields.
    const row = entry.slice(entry.indexOf("Where") - 120, entry.indexOf("Time outside"));
    expect(row).toContain("Leash");
    expect(at(entry, "Time outside")).toBeGreaterThan(at(entry, "Leash"));
    const second = html.slice(at(html, 'data-section="secondary"'), at(html, 'data-section="note"'));
    expect(second.indexOf("Treats")).toBeLessThan(second.indexOf("Medical issue"));
    expect(html).not.toContain("f-treat-item");
  });
});

describe("Food", () => {
  it("has Type (Meal, Snuffle mat, Treat) then What and a half-size Amount on one line", () => {
    const html = render("food");
    const entry = html.slice(at(html, 'data-section="entry"'), at(html, 'data-section="note"'));
    for (const t of ["Meal", "Snuffle mat", "Treat"]) expect(entry).toContain(t);
    expect(entry.indexOf("Type")).toBeLessThan(entry.indexOf("What"));
    expect(entry.indexOf("What")).toBeLessThan(entry.indexOf("Amount"));
    expect(entry).toContain("max-width:44px"); // narrowed again by TEC-202
  });
});

describe("Training and Fun", () => {
  it("Training: Where and Time on one line, then Commands and Other dogs on one line, then the treats count", () => {
    const html = render("training");
    const entry = html.slice(at(html, 'data-section="entry"'), at(html, 'data-section="secondary"'));
    expect(entry.indexOf("Where")).toBeLessThan(entry.indexOf("Time (min)"));
    expect(entry.indexOf("Time (min)")).toBeLessThan(entry.indexOf("Commands practised"));
    expect(entry.indexOf("Commands practised")).toBeLessThan(entry.indexOf("Other dogs"));
    expect(entry).toContain("grid-cols-2");
    expect(html.slice(at(html, 'data-section="secondary"'), at(html, 'data-section="note"'))).toContain("Treats");
    expect(html).not.toContain("f-treat-item");
  });
  it("Fun keeps its treats as a count too", () => {
    const html = render("fun");
    expect(html).not.toContain("Treats used");
    expect(html.slice(at(html, 'data-section="secondary"'))).toContain("Treats");
  });
});

/* ── Compact controls ───────────────────────────────────────────────────── */

describe("compact controls", () => {
  it("chips size to their content with narrow padding, wrap, and keep a 44px hit area", () => {
    const html = render("potty");
    expect(html).toContain("px-2.5 py-1");
    expect(html).toContain("min-h-[44px]");
    expect(html).toContain("flex-wrap");
    expect(html).not.toContain("px-3.5 py-2");
  });
  it("field boxes are narrow-padded and 44px tall", () => {
    expect(render("weight")).toMatch(/min-h-\[44px\][^"]*px-2 py-1\.5/);
  });
});

/* ── Treat counts ───────────────────────────────────────────────────────── */

describe("the treat count", () => {
  it("is a − and + around a number, opening on 0, with no picker", () => {
    const html = renderToStaticMarkup(createElement(TreatCount, { value: 0, onChange: () => {} }));
    expect(html).toContain("One fewer treat");
    expect(html).toContain("One more treat");
    expect(html).toContain(">0</output>");
    expect(html).not.toContain("<select");
  });
  it("saves nothing at 0", () => {
    expect(inlineTreatEntries({ id: "a", item_id: MISC_ID, qty: 0 }, AT, null)).toEqual([]);
  });
  it("above 0 saves its own Misc treat, amount the count, at the entry's time and person", () => {
    const person = "44444444-4444-4444-8444-444444444444";
    const [t] = inlineTreatEntries({ id: "55555555-5555-4555-8555-555555555555", item_id: MISC_ID, qty: 3 }, AT, person);
    expect(t).toMatchObject({ kind: "food", at: AT, person_id: person, note: null });
    expect(t.details).toMatchObject({ type: "treat", item_id: "misc", item_name: "Misc", unit: null, amount: 3 });
  });
  it("is saved only after the parent, and not at all when the parent fails", async () => {
    const calls: string[] = [];
    const saveOne = async (b: string) => (calls.push(`save ${b}`), b !== "bad");
    const saveNext = (b: string) => void calls.push(`then ${b}`);
    await saveThen(saveOne, saveNext, "potty", ["treat"]);
    expect(calls).toEqual(["save potty", "then treat"]);
    calls.length = 0;
    expect(await saveThen(saveOne, saveNext, "bad", ["treat"])).toBe(false);
    expect(calls).toEqual(["save bad"]);
  });
  it("is wired on Potty, Training and Fun through the Misc entry, after the parent (source check)", () => {
    const form = readFileSync(resolve(__dirname, "../app/LogForm.tsx"), "utf8");
    expect(form).toContain("inlineTreatEntries({ id: treatId.current, item_id: MISC_ID, qty: treatQty }");
    expect(form.indexOf("onLog(body, then)")).toBeGreaterThan(form.indexOf("inlineTreatEntries("));
  });
});

/* ── Medication ─────────────────────────────────────────────────────────── */

describe("Medication", () => {
  const dose = { type: "medication", med_id: MED.id, dose: 1.5, unit: "tablet", route: "mouth" };

  it("is the third Health tab beside Vet visit and Medical issue", () => {
    const html = render("health");
    const type = html.slice(at(html, 'aria-label="Type"'), at(html, 'data-section="note"'));
    expect(type.indexOf("Vet visit")).toBeLessThan(type.indexOf("Medical issue"));
    expect(type.indexOf("Medical issue")).toBeLessThan(type.indexOf("Medication"));
  });

  it("lays out Medication, Dose and Unit on one line, then Given, then For a medical issue", () => {
    const html = render("health", { healthType: "medication" });
    const entry = html.slice(at(html, 'data-section="entry"'), at(html, 'data-section="note"'));
    expect(entry.indexOf("Medication")).toBeLessThan(entry.indexOf("Dose"));
    expect(entry.indexOf("Dose")).toBeLessThan(entry.indexOf("Unit"));
    expect(entry.indexOf("Unit")).toBeLessThan(entry.indexOf("Given"));
    for (const [, label] of MED_ROUTES) expect(entry).toContain(label);
    expect(entry.indexOf("Given")).toBeLessThan(entry.indexOf("For a medical issue"));
    expect(entry).toContain("Add a medication…");
    expect(entry).toContain("Test Tablet");
    expect(entry).not.toContain("Old Syrup"); // retired: off the list
  });

  it("saves a dose with the name taken from the medication, never from the phone", () => {
    expect(parseDetails("health", { ...dose, med_name: "Spoofed" }, [], MEDS)).toEqual({
      type: "medication",
      med_id: MED.id,
      med_name: "Test Tablet",
      dose: 1.5,
      unit: "tablet",
      route: "mouth",
    });
  });
  it("still resolves a retired medication, so an old dose can be corrected", () => {
    expect(findMedication(MEDS, OLD.id)?.retired).toBe(true);
    expect(parseDetails("health", { ...dose, med_id: OLD.id, unit: "ml" }, [], MEDS)).toMatchObject({ med_name: "Old Syrup" });
    expect(medPicklist(MEDS).map((m) => m.id)).toEqual([MED.id]);
  });
  it("refuses an unknown medication, a bad dose, unit or route, and an issue that is not a uuid", () => {
    expect(() => parseDetails("health", { ...dose, med_id: ISSUE_ID }, [], MEDS)).toThrow(/not in the list/);
    expect(() => parseDetails("health", dose)).toThrow(/not in the list/);
    for (const d of [0, -1, 10_001, "5", Number.NaN]) expect(() => parseDetails("health", { ...dose, dose: d }, [], MEDS)).toThrow(InvalidEvent);
    expect(() => parseDetails("health", { ...dose, unit: "gallon" }, [], MEDS)).toThrow(InvalidEvent);
    expect(() => parseDetails("health", { ...dose, route: "nose" }, [], MEDS)).toThrow(InvalidEvent);
    expect(() => parseDetails("health", { ...dose, issue: "x" }, [], MEDS)).toThrow(InvalidEvent);
  });
  it("takes an optional issue link and photos like a vet visit", () => {
    const photo = "health/66666666-6666-4666-8666-666666666666.jpg";
    expect(parseDetails("health", { ...dose, issue: ISSUE_ID, photos: [photo] }, [], MEDS)).toMatchObject({ issue: ISSUE_ID, photos: [photo] });
  });
  it("needs no note and no reason; a vet visit still needs its note", () => {
    const body = { id: "77777777-7777-4777-8777-777777777777", kind: "health", at: AT, details: dose };
    expect(parseNewEvent(body, new Date(AT), [], MEDS).note).toBeNull();
    expect(() => parseNewEvent({ ...body, details: { type: "vet", reasons: ["checkup"] } }, new Date(AT))).toThrow(/note is required/);
    expect(() => checkHealthReasons({ details: parseDetails("health", dose, [], MEDS) }, null)).not.toThrow();
  });
  it("reads in the feed as the medication, the dose and how it was given", () => {
    const d = parseDetails("health", dose, [], MEDS);
    expect(describeEvent({ kind: "health", details: d })).toEqual({ title: "Medication", detail: "Test Tablet · 1.5 tablets · by mouth" });
    expect(doseText(1, "tablet")).toBe("1 tablet");
    expect(doseText(5, "mg")).toBe("5 mg");
  });

  it("adds a medication: trimmed, a unit from the list, never a duplicate in any case (retired too)", () => {
    expect(parseNewMedication({ name: "  New   Drops ", unit: "ml" }, MEDS)).toEqual({ name: "New Drops", unit: "ml" });
    expect(() => parseNewMedication({ name: "test tablet", unit: "mg" }, MEDS)).toThrow(/already in the list/);
    expect(() => parseNewMedication({ name: "OLD SYRUP", unit: "mg" }, MEDS)).toThrow(/already in the list/);
    expect(() => parseNewMedication({ name: "", unit: "mg" })).toThrow(InvalidEvent);
    expect(() => parseNewMedication({ name: "x".repeat(61), unit: "mg" })).toThrow(InvalidEvent);
    expect(() => parseNewMedication({ name: "Fine", unit: "gallon" })).toThrow(InvalidEvent);
    expect(medNameTaken("Test Tablet", MEDS)).toBe(true);
  });

  /** The calls the medication paths make, over an in-memory medications table. */
  function fakeDb(rows: Record<string, unknown>[]) {
    const inserted: Record<string, unknown>[] = [];
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain,
      order: chain,
      then: (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok, fail),
      insert: (r: Record<string, unknown>) => (inserted.push(r), b),
      single: async () => ({ data: { id: "88888888-8888-4888-8888-888888888888" }, error: null }),
    });
    return { db: { from: vi.fn(() => b) } as never, inserted };
  }
  it("reads the table and adds to it through the server routes' functions", async () => {
    const { db, inserted } = fakeDb([{ id: MED.id, name: MED.name, unit: MED.unit, retired: false }, { ...OLD }]);
    expect(await listMedications(db)).toEqual([MED, OLD]);
    const added = await addMedication(db, { name: "Another", unit: "mg" });
    expect(added).toMatchObject({ name: "Another", unit: "mg" });
    expect(inserted).toEqual([{ name: "Another", unit: "mg" }]);
    await expect(addMedication(db, { name: "Test Tablet", unit: "mg" })).rejects.toThrow(/already in the list/);
  });
  it("a dose is checked against the table on write; an unknown medication saves nothing", async () => {
    const { db } = fakeDb([]);
    await expect(
      writeEvent(db, { id: "99999999-9999-4999-8999-999999999999", kind: "health", at: AT, details: dose }, new Date(AT))
    ).rejects.toThrow(/not in the list/);
  });
});

/* ── Future entries ─────────────────────────────────────────────────────── */

describe("a future When", () => {
  const now = new Date(2026, 10, 1, 15, 0, 0);
  it("is later than now; the same minute is not the future", () => {
    expect(isFutureWhen(new Date(2026, 10, 1, 15, 1), now)).toBe(true);
    expect(isFutureWhen(new Date(2026, 10, 1, 15, 0, 0), now)).toBe(false);
    expect(isFutureWhen(new Date(2026, 9, 31), now)).toBe(false);
    expect(isFutureWhen(null, now)).toBe(false);
  });
  it("is a later day for a weight, which is a day", () => {
    expect(isFutureDay("2026-11-02", "2026-11-01")).toBe(true);
    expect(isFutureDay("2026-11-01", "2026-11-01")).toBe(false);
    expect(isFutureDay("", "2026-11-01")).toBe(false);
  });
  const base = { healthType: "vet" as HealthType, day: "2026-11-08", time: "09:30", note: "bring the records", repeatEvery: null, repeatUnit: null };
  it("saves an upcoming item, kind from the form: Vet visit, Medication, or Other with the form's name", () => {
    expect(futureItem({ ...base, form: "health", reason: "checkup" })).toMatchObject({ kind: "vet", title: "Vet visit · Check-up", due_on: "2026-11-08", due_time: "09:30", note: "bring the records" });
    expect(futureItem({ ...base, form: "health", healthType: "medication", med: { name: "Test Tablet", dose: 5, unit: "mg" } })).toMatchObject({ kind: "medication", title: "Test Tablet · 5 mg" });
    expect(futureItem({ ...base, form: "health", healthType: "issue" })).toMatchObject({ kind: "other", title: "Medical issue" });
    for (const [form, title] of [["potty", "Potty"], ["food", "Food"], ["fun", "Fun"], ["training", "Training"]] as const) {
      expect(futureItem({ ...base, form })).toMatchObject({ kind: "other", title });
    }
    expect(futureItem({ ...base, form: "weight", time: null })).toMatchObject({ kind: "other", title: "Weight", due_time: null });
    expect(futureTitle({ form: "health", healthType: "vet" })).toBe("Vet visit");
  });
  it("carries an optional repeat, and refuses a half one", () => {
    expect(futureItem({ ...base, form: "training", repeatEvery: 2, repeatUnit: "week" })).toMatchObject({ repeat_every: 2, repeat_unit: "week" });
    expect(() => futureItem({ ...base, form: "training", repeatEvery: 100, repeatUnit: "week" })).toThrow(InvalidEvent);
  });
  it("is an upcoming item, not a journal event: the form says so, shows Repeat, and never reaches onLog (source check)", () => {
    const form = readFileSync(resolve(__dirname, "../app/LogForm.tsx"), "utf8");
    expect(form).toContain("FUTURE_NOTICE");
    const submit = form.slice(form.indexOf("async function submit("), form.indexOf("async function remove("));
    expect(submit.indexOf("await submitFuture()")).toBeGreaterThan(0);
    expect(submit.indexOf("await submitFuture()")).toBeLessThan(submit.indexOf("onLog(body, then)"));
    expect(submit.slice(0, submit.indexOf("await submitFuture()"))).not.toContain("onLog");
    expect(form).toContain("await onUpcoming(item, plan?.id)");
    // The Repeat control is inside the planning branch only (a future When, or an open item being edited).
    expect(form).toMatch(/\{planning && \(\s+<div className="flex flex-wrap items-center gap-x-2">/);
  });
  it("a saved entry cannot move to the future, and the server refuses a time past a day ahead", () => {
    const body = { id: "99999999-9999-4999-8999-999999999999", kind: "potty", at: "2026-11-09T12:00:00.000Z", details: { what: "pee", where: "outside" } };
    expect(() => parseNewEvent(body, new Date("2026-11-01T12:00:00.000Z"))).toThrow(/future/);
  });
});

function item(over: Partial<Upcoming> = {}): Upcoming {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    kind: "vet",
    title: "Vet visit",
    due_on: "2026-11-06",
    due_time: null,
    note: null,
    repeat_every: null,
    repeat_unit: null,
    status: "open",
    done_on: null,
    done_event: null,
    created_at: "2026-10-29T12:00:00Z",
    updated_at: "2026-10-29T12:00:00Z",
    ...over,
  };
}
const TODAY = "2026-11-01";

describe("Next 7 days and the Upcoming filter", () => {
  const items = [
    item({ id: "a0000000-0000-4000-8000-000000000001", title: "Later", due_on: "2026-11-20" }),
    item({ id: "a0000000-0000-4000-8000-000000000002", title: "Overdue", due_on: "2026-10-28" }),
    item({ id: "a0000000-0000-4000-8000-000000000003", title: "Edge", due_on: "2026-11-08" }),
    item({ id: "a0000000-0000-4000-8000-000000000004", title: "Today", due_on: "2026-11-01", due_time: "09:00" }),
    item({ id: "a0000000-0000-4000-8000-000000000005", title: "Beyond", due_on: "2026-11-09" }),
    item({ id: "a0000000-0000-4000-8000-000000000006", title: "Done", due_on: "2026-11-02", status: "done" }),
    item({ id: "a0000000-0000-4000-8000-000000000007", title: "Cancelled", due_on: "2026-11-02", status: "cancelled" }),
  ];
  it("Next 7 days lists open items due within the week, overdue ones too, soonest first", () => {
    expect(nextWeek(items, TODAY).map((i) => i.title)).toEqual(["Overdue", "Today", "Edge"]);
  });
  it("the Upcoming filter lists every open item, soonest first", () => {
    expect(allUpcoming(items).map((i) => i.title)).toEqual(["Overdue", "Today", "Edge", "Beyond", "Later"]);
  });
  it("existing items keep showing: an old vet visit, vaccine, medication and Other all list", () => {
    const old = [item({ kind: "vaccine", title: "Rabies booster" }), item({ id: "b0000000-0000-4000-8000-000000000001", kind: "medication", title: "Heartworm pill", due_on: "2026-11-03" }), item({ id: "b0000000-0000-4000-8000-000000000002", kind: "other", title: "Groomer", due_on: "2026-11-04" })];
    expect(nextWeek(old, TODAY)).toHaveLength(3);
  });
  it("rows wear the status colours, say overdue in words, and have Done (and Cancel in the filter)", () => {
    const html = renderToStaticMarkup(createElement(UpcomingList, { items: [items[1], items[3]], today: TODAY, onDone: async () => {}, onCancel: async () => ({ error: null }) }));
    expect(html).toContain('data-status="red"');
    expect(html).toContain('data-status="yellow"');
    expect(html).toContain("red, overdue");
    expect(html).toContain("Done: Overdue");
    expect(html).toContain("Cancel Overdue");
    expect(renderToStaticMarkup(createElement(UpcomingList, { items: [items[1]], today: TODAY, onDone: async () => {} }))).not.toContain("Cancel");
  });
});

describe("Done opens the matching form, prefilled", () => {
  it("a vet visit or vaccine opens Vet visit; a medication opens Medication; an Other made from a form opens that form", () => {
    expect(formForItem({ kind: "vet", title: "Vet visit" })).toEqual({ form: "health", healthType: "vet" });
    expect(formForItem({ kind: "vaccine", title: "Rabies booster" })).toEqual({ form: "health", healthType: "vet" });
    expect(formForItem({ kind: "medication", title: "Test Tablet · 5 mg" })).toEqual({ form: "health", healthType: "medication" });
    expect(formForItem({ kind: "other", title: "Training" })).toMatchObject({ form: "training" });
    expect(formForItem({ kind: "other", title: "Potty" })).toMatchObject({ form: "potty" });
    expect(formForItem({ kind: "other", title: "Medical issue" })).toEqual({ form: "health", healthType: "issue" });
  });
  it("an old Other item with its own words is just marked done, as before", () => {
    expect(formForItem({ kind: "other", title: "Groomer" })).toBeNull();
  });
  it("a form-made vet visit gives its reason; the item's note is the form's note", () => {
    const p = donePrefill(item({ title: "Vet visit · Check-up", note: "bring the records", due_time: "09:30" }));
    expect(p).toMatchObject({ day: "2026-11-06", time: "09:30", reason: "checkup", note: "bring the records" });
  });
  it("an old vet item keeps its title as the note, as TEC-192 did", () => {
    expect(donePrefill(item({ kind: "vaccine", title: "Rabies booster" }))).toMatchObject({ reason: "vaccines", note: "Rabies booster" });
  });
  it("a medication gives the medication, dose and unit from its title", () => {
    expect(donePrefill(item({ kind: "medication", title: "Test Tablet · 5 mg" }), MEDS)).toMatchObject({ medId: MED.id, dose: "5", unit: "mg", note: "" });
    expect(donePrefill(item({ kind: "medication", title: "Heartworm pill" }), MEDS)).toMatchObject({ medId: "", dose: "", unit: "" });
  });
  it("opens on the item's day and time once they have come, else on now (never a second future entry)", () => {
    const p = { day: "2026-11-06", time: "09:30" };
    expect(doneWhen(p, new Date(2026, 10, 7))).toBe("2026-11-06T09:30");
    expect(doneWhen(p, new Date(2026, 10, 1))).toBeNull();
  });
  it("closing is wired for any form: the entry saved from a Done closes its item (source check)", () => {
    const journal = readFileSync(resolve(__dirname, "../app/Journal.tsx"), "utf8");
    expect(journal).toContain("if (open?.doneFor) visitLinks.current.set(body.id, open.doneFor.id)");
    expect(journal).toContain("saveThenClose(saveOne, (v) => closeUpcoming(itemId, v), b)");
    expect(journal).toContain("setOpen({ form: target.form, healthType: target.healthType, doneFor: item })");
  });
});

/* ── The Log screen ─────────────────────────────────────────────────────── */

describe("the Log screen", () => {
  const html = renderToStaticMarkup(createElement(Journal));
  it("has four tabs, Log, Notes, Analytics and Patch notes, in that order (TEC-204)", () => {
    const tabs = [...html.matchAll(/role="tab"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(tabs).toEqual(["Log", "Notes", "Analytics", "Patch notes"]);
    expect(html).not.toContain("Upcoming</button>");
    expect(html).not.toContain("What&#x27;s new");
  });
  it("has the four buttons Treats, Training, Weight, Health (TEC-202 put them back; no Potty, Food or Fun button)", () => {
    const log = html.slice(at(html, 'aria-label="Log"'), at(html, 'for="who"'));
    const labels = [...log.matchAll(/<b[^>]*>([^<]+)<\/b>/g)].map((m) => m[1]);
    expect(labels).toEqual(["Treats", "Training", "Weight", "Health"]);
  });
  it("shows the four pills as plain boxes until the journal loads, then each is a button that opens a quick log (TEC-202)", () => {
    const pills = html.slice(at(html, 'aria-label="Since last"'), at(html, 'aria-label="Log"'));
    expect(pills).not.toContain("<button");
    for (const l of ["Pee", "Poop", "Meals", "Fun"]) expect(pills).toContain(l);
    const journal = readFileSync(resolve(__dirname, "../app/Journal.tsx"), "utf8");
    expect(journal).toContain("quickLog(c, clocks.food, foods)");
    expect(journal).toContain("setOpen({ form: tap.form, quick: tap })");
  });
  it("has an Upcoming filter in the feed's Show only row", () => {
    const filter = html.slice(at(html, 'aria-label="Show only"'));
    expect(filter.indexOf("Health")).toBeLessThan(filter.indexOf("Upcoming"));
  });
});

/* ── The migrations ─────────────────────────────────────────────────────── */

import { readdirSync } from "node:fs";

describe("the medication migrations", () => {
  const dir = resolve(__dirname, "../../../supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const read = (suffix: string) => readFileSync(resolve(dir, files.find((f) => f.endsWith(suffix))!), "utf8");
  const code = (sql: string) => sql.replace(/--.*$/gm, "");
  const table = code(read("_lando_medications.sql"));
  const fnSql = read("_lando_medication_entries.sql");
  const fn = code(fnSql);
  const block = (sql: string, from: string, to: string) => sql.slice(sql.indexOf(from), sql.indexOf(to));
  const listIn = (sql: string, after: string) => [...sql.slice(sql.indexOf(after)).match(/IN \(([^)]*)\)/)![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

  it("creates lando.medications like lando.foods: RLS on, no policy, a unique name, retired", () => {
    expect(table).toMatch(/CREATE TABLE lando\.medications \(/);
    expect(table).toMatch(/ALTER TABLE lando\.medications ENABLE ROW LEVEL SECURITY/);
    expect(table).not.toMatch(/CREATE POLICY/i);
    expect(table).toMatch(/CREATE UNIQUE INDEX medications_name_key ON lando\.medications \(lower\(btrim\(name\)\)\)/);
    for (const col of ["id uuid PRIMARY KEY", "name text NOT NULL", "unit text NOT NULL", "created_at timestamptz", "retired boolean NOT NULL DEFAULT false"]) expect(table).toContain(col);
    expect(table).not.toMatch(/\b(drop|alter table (?!lando\.medications ENABLE)|delete|update|insert)\b/i);
  });
  it("sorts before the function, which names the table's ids", () => {
    expect(files.indexOf(files.find((f) => f.endsWith("_lando_medications.sql"))!)).toBeLessThan(files.indexOf(files.find((f) => f.endsWith("_lando_medication_entries.sql"))!));
  });
  it("the units in the table, the function and the code are one list", () => {
    expect(listIn(table, "unit IN")).toEqual([...MED_UNITS]);
    expect(listIn(fn, "details ->> 'unit' IN ('mg'")).toEqual([...MED_UNITS]);
  });
  it("the routes in the function and the code are one list", () => {
    expect(listIn(fn, "details ->> 'route' IN")).toEqual(MED_ROUTES.map(([id]) => id));
  });
  it("replaces details_ok whole: lock_timeout, search_path pinned, the function only, never a DROP", () => {
    expect(fn.trim().startsWith("set local lock_timeout = '5s';")).toBe(true);
    expect(fn).toMatch(/create or replace function lando\.details_ok\(kind text, details jsonb\)/);
    expect(fn).toMatch(/set search_path = ''/);
    expect(fn).not.toMatch(/\b(drop|alter)\b/i);
  });
  it("adds a medication branch to health and keeps the vet and issue shape, and every other branch, as lando_snuffle_type had them", () => {
    const prev = read("_lando_snuffle_type.sql");
    expect(fn).toContain("details ->> 'type' = 'medication'");
    for (const [from, to] of [
      ["WHEN 'potty' THEN", "WHEN 'food' THEN"],
      ["WHEN 'food' THEN", "WHEN 'exercise' THEN"],
      ["WHEN 'exercise' THEN", "WHEN 'weight' THEN"],
      ["WHEN 'weight' THEN", "WHEN 'health' THEN"],
    ]) {
      expect(block(fnSql, from, to)).toBe(block(prev, from, to));
    }
    expect(fnSql.slice(fnSql.indexOf("WHEN 'void' THEN"))).toBe(prev.slice(prev.indexOf("WHEN 'void' THEN")));
    // The old health shape, line for line, is the ELSE branch.
    const oldHealth = block(prev, "WHEN 'health' THEN", "WHEN 'void' THEN").split("\n").slice(1).map((l) => l.trim()).filter(Boolean);
    const elseBranch = block(fnSql, "        ELSE\n", "WHEN 'void' THEN").split("\n").map((l) => l.trim());
    for (const line of oldHealth) expect(elseBranch, line).toContain(line);
  });
  it("the medication branch allows the keys the code saves, and no reasons", () => {
    const med = block(fn, "details ->> 'type' = 'medication'", "        ELSE\n");
    expect(med).toContain("ARRAY['type', 'med_id', 'med_name', 'dose', 'unit', 'route']");
    expect(med).toContain("'route', 'photos', 'issue'] = '{}'::jsonb");
    expect(med).not.toContain("reasons");
    expect(med).toContain("BETWEEN 1 AND 6");
    expect(med).toContain("<= 10000");
  });
});
