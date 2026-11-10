// @vitest-environment jsdom
// TEC-259: vaccines are logged. A Vaccine type in Health (the vaccine and its dose), "Vaccines given" on a vet visit
// (each its own entry linked by parent_id), and an offer to plan the next dose from a pure rule. jsdom cannot show how
// this looks or feels on a phone: that is a phone check.
import { createElement } from "react";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import LogForm from "@/app/LogForm";
import {
  InvalidEvent,
  describe as describeEvent,
  earlierDoses,
  parseDetails,
  parseNewEvent,
  vaccinesWith,
  HEALTH_TYPES,
  type JournalEvent,
} from "@/lib/events";
import { donePrefill, formForItem, futureItem } from "@/lib/future";
import { nextDose, nextDosePlan, visitVaccineEntries } from "@/lib/vaccine-plan";
import { DOSE_MAX, VACCINES, VACCINE_IDS, hasDoses, parseVaccinePlanTitle, suggestedDose, vaccineLabel, vaccinePlanTitle, vaccineText } from "@/lib/vaccines";

// Invented ids. Nothing here is a real record (RULES.md, Never 2).
const PERSON = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VISIT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const VISIT2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const SHOT = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const SHOT2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const NOW = new Date("2026-11-09T12:00:00Z");

let n = 0;
const ev = (kind: JournalEvent["kind"], at: string, details: Record<string, unknown>, extra: Partial<JournalEvent> = {}): JournalEvent => ({
  id: `dddddddd-dddd-4ddd-8ddd-${String(++n).padStart(12, "0")}`,
  kind,
  at,
  person_id: null,
  details,
  note: null,
  voids: null,
  parent_id: null,
  created_at: at,
  ...extra,
});

describe("the vaccine list", () => {
  it("is the owner's four, in order, and every id is stored lowercase", () => {
    expect(VACCINES.map((v) => v.label)).toEqual(["DHPP", "Bordetella", "Leptospirosis", "Rabies"]);
    expect(VACCINE_IDS).toEqual(["dhpp", "bordetella", "leptospirosis", "rabies"]);
  });

  it("a dose number belongs to DHPP and Leptospirosis, one more than those already logged, never above the top", () => {
    expect(hasDoses("dhpp")).toBe(true);
    expect(hasDoses("leptospirosis")).toBe(true);
    expect(hasDoses("rabies")).toBe(false);
    expect(hasDoses("bordetella")).toBe(false);
    expect(suggestedDose("dhpp", 0)).toBe(1);
    expect(suggestedDose("dhpp", 2)).toBe(3);
    expect(suggestedDose("dhpp", 40)).toBe(DOSE_MAX);
    expect(suggestedDose("rabies", 0)).toBeNull();
  });

  it("names a vaccine, offered or not", () => {
    expect(vaccineLabel("leptospirosis")).toBe("Leptospirosis");
    expect(vaccineLabel("parvo")).toBe("parvo");
    expect(vaccineText("dhpp", 2)).toBe("DHPP · dose 2");
    expect(vaccineText("rabies")).toBe("Rabies");
  });
});

describe("nextDose (the suggested date)", () => {
  it("DHPP and Leptospirosis: 3 weeks on while under 16 weeks old, then a year", () => {
    // Born 2026-08-01: on 2026-10-15 the puppy is 10 weeks old.
    expect(nextDose({ vaccine: "dhpp", givenOn: "2026-10-15", birthOn: "2026-08-01" })).toEqual({ on: "2026-11-05", text: "3–4 weeks", series: true });
    expect(nextDose({ vaccine: "leptospirosis", givenOn: "2026-10-15", birthOn: "2026-08-01" }).on).toBe("2026-11-05");
    // Exactly 16 weeks (112 days) is no longer under 16 weeks.
    expect(nextDose({ vaccine: "dhpp", givenOn: "2026-11-21", birthOn: "2026-08-01" })).toEqual({ on: "2027-11-21", text: "1 year", series: false });
    expect(nextDose({ vaccine: "dhpp", givenOn: "2026-11-20", birthOn: "2026-08-01" }).series).toBe(true);
  });

  it("without a birth date the dose number stands in: doses 1 and 2 are the puppy series, 3 and later are yearly", () => {
    expect(nextDose({ vaccine: "dhpp", givenOn: "2026-10-15", dose: 1 }).on).toBe("2026-11-05");
    expect(nextDose({ vaccine: "dhpp", givenOn: "2026-10-15", dose: 2 }).on).toBe("2026-11-05");
    expect(nextDose({ vaccine: "dhpp", givenOn: "2026-10-15", dose: 3 }).on).toBe("2027-10-15");
    // No dose either: the log decides (none before it is dose 1).
    expect(nextDose({ vaccine: "dhpp", givenOn: "2026-10-15", earlier: 0 }).on).toBe("2026-11-05");
    expect(nextDose({ vaccine: "dhpp", givenOn: "2026-10-15", earlier: 4 }).on).toBe("2027-10-15");
  });

  it("the birth date beats the dose number when both are known", () => {
    expect(nextDose({ vaccine: "dhpp", givenOn: "2026-10-15", dose: 5, birthOn: "2026-08-01" }).on).toBe("2026-11-05");
    expect(nextDose({ vaccine: "dhpp", givenOn: "2026-10-15", dose: 1, birthOn: "2025-01-01" }).on).toBe("2027-10-15");
  });

  it("Rabies: a year after the first, then every 3 years", () => {
    expect(nextDose({ vaccine: "rabies", givenOn: "2026-11-09", earlier: 0 })).toEqual({ on: "2027-11-09", text: "1 year", series: false });
    expect(nextDose({ vaccine: "rabies", givenOn: "2027-11-09", earlier: 1 })).toEqual({ on: "2030-11-09", text: "3 years", series: false });
  });

  it("Bordetella: 6 months on (the range is 6 to 12)", () => {
    expect(nextDose({ vaccine: "bordetella", givenOn: "2026-08-31" })).toEqual({ on: "2027-02-28", text: "6–12 months", series: false });
  });

  it("a vaccine the rules do not know is yearly; a bad day throws", () => {
    expect(nextDose({ vaccine: "parvo", givenOn: "2026-02-28" }).on).toBe("2027-02-28");
    expect(() => nextDose({ vaccine: "dhpp", givenOn: "soon" })).toThrow();
  });
});

describe("the plan a dose makes", () => {
  it("is a vaccine plan titled with the vaccine, and the dose number while the puppy series goes on", () => {
    const plan = nextDosePlan({ vaccine: "dhpp", dose: 2, series: true, on: "2026-11-05" });
    expect(plan).toMatchObject({ kind: "vaccine", title: "Vaccine · DHPP · dose 3", due_on: "2026-11-05", due_time: null, repeat_every: null });
    expect(nextDosePlan({ vaccine: "dhpp", dose: 3, series: false, on: "2027-10-15" }).title).toBe("Vaccine · DHPP");
    expect(nextDosePlan({ vaccine: "rabies", dose: null, series: false, on: "2027-11-09" }).title).toBe("Vaccine · Rabies");
    expect(nextDosePlan({ vaccine: "dhpp", dose: DOSE_MAX, series: true, on: "2026-11-05" }).title).toBe("Vaccine · DHPP");
  });

  it("the title reads back: Done opens the Vaccine form on that vaccine and dose", () => {
    expect(parseVaccinePlanTitle(vaccinePlanTitle("leptospirosis", 2))).toEqual({ vaccine: "leptospirosis", dose: 2 });
    expect(parseVaccinePlanTitle("Vaccine · Rabies")).toEqual({ vaccine: "rabies", dose: null });
    expect(parseVaccinePlanTitle("Rabies booster")).toBeNull();
    expect(parseVaccinePlanTitle("Vaccine · Parvo")).toBeNull();
    const item = { kind: "vaccine" as const, title: "Vaccine · DHPP · dose 3", note: null, due_on: "2026-11-05", due_time: null };
    expect(formForItem(item)).toEqual({ form: "health", healthType: "vaccine" });
    expect(donePrefill(item)).toMatchObject({ vaccine: "dhpp", vaccineDose: 3, note: "" });
    // An older plan with its own words still closes through a vet visit.
    expect(formForItem({ kind: "vaccine", title: "Rabies booster" })).toEqual({ form: "health", healthType: "vet" });
    expect(donePrefill({ ...item, title: "Rabies booster" })).toMatchObject({ vaccine: "", vaccineDose: null, reason: "vaccines" });
  });

  it("a future Vaccine entry becomes that same plan", () => {
    const it2 = futureItem({
      form: "health",
      healthType: "vaccine",
      day: "2026-12-01",
      time: "09:00",
      note: "",
      repeatEvery: null,
      repeatUnit: null,
      vaccine: { id: "dhpp", dose: 2 },
    });
    expect(it2).toMatchObject({ kind: "vaccine", title: "Vaccine · DHPP · dose 2", due_on: "2026-12-01" });
    expect(futureItem({ form: "health", healthType: "vaccine", day: "2026-12-01", time: null, note: "", repeatEvery: null, repeatUnit: null }).title).toBe("Vaccine");
  });
});

describe("a Vaccine entry", () => {
  it("is Health's fifth type", () => {
    expect(HEALTH_TYPES).toEqual(["vet", "issue", "medication", "vaccine"]);
  });

  it("holds the vaccine and, for DHPP and Leptospirosis, a whole dose from 1 to 6; it has no reasons", () => {
    expect(parseDetails("health", { type: "vaccine", vaccine: "dhpp", dose: 2 })).toEqual({ type: "vaccine", vaccine: "dhpp", dose: 2 });
    expect(parseDetails("health", { type: "vaccine", vaccine: "rabies" })).toEqual({ type: "vaccine", vaccine: "rabies" });
    expect(() => parseDetails("health", { type: "vaccine" })).toThrow(/pick a vaccine/);
    expect(() => parseDetails("health", { type: "vaccine", vaccine: "parvo" })).toThrow(InvalidEvent);
    expect(() => parseDetails("health", { type: "vaccine", vaccine: "rabies", dose: 1 })).toThrow(/no dose number/);
    for (const dose of [0, 7, 1.5, "2", NaN]) expect(() => parseDetails("health", { type: "vaccine", vaccine: "dhpp", dose })).toThrow(InvalidEvent);
    // A vet visit's reasons and issue do not ride on a vaccine.
    expect(parseDetails("health", { type: "vaccine", vaccine: "dhpp", reasons: ["other"], issue: "x" })).toEqual({ type: "vaccine", vaccine: "dhpp" });
  });

  it("takes the shared extras: a note link and attachments", () => {
    const note = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    expect(parseDetails("health", { type: "vaccine", vaccine: "dhpp", note_id: note })).toMatchObject({ note_id: note });
  });

  it("saves without a note (a dose and a vaccine need no story), and is read back as Vaccine", () => {
    const e = parseNewEvent({ id: SHOT, kind: "health", at: NOW.toISOString(), details: { type: "vaccine", vaccine: "dhpp", dose: 1 } }, NOW);
    expect(e.note).toBeNull();
    expect(describeEvent({ kind: "health", details: e.details })).toEqual({ title: "Vaccine", detail: "DHPP · dose 1" });
    expect(describeEvent({ kind: "health", details: { type: "vaccine", vaccine: "rabies", photos: [] } }).detail).toBe("Rabies");
  });

  it("may be made from a vet visit: a vaccine carries parent_id, a vet visit or an issue does not", () => {
    const vaccine = { id: SHOT, kind: "health", at: NOW.toISOString(), details: { type: "vaccine", vaccine: "rabies" }, parent_id: VISIT };
    expect(parseNewEvent(vaccine, NOW).parent_id).toBe(VISIT);
    expect(() => parseNewEvent({ ...vaccine, id: SHOT2, parent_id: SHOT2 }, NOW)).toThrow(/itself/);
    const visit = { id: SHOT, kind: "health", at: NOW.toISOString(), note: "x", details: { type: "vet", reasons: ["checkup"] }, parent_id: VISIT2 };
    expect(() => parseNewEvent(visit, NOW)).toThrow(/only a treat, a potty, a weight or a vaccine/);
    expect(() => parseNewEvent({ ...visit, kind: "exercise" }, NOW)).toThrow(InvalidEvent);
  });
});

describe("the vaccines given at a vet visit", () => {
  const visit = ev("health", "2026-11-09T15:00:00.000Z", { type: "vet", reasons: ["vaccines"] }, { id: VISIT, note: "shots" });
  const dhpp = ev("health", "2026-11-09T15:00:00.000Z", { type: "vaccine", vaccine: "dhpp", dose: 1 }, { parent_id: VISIT });
  const rabies = ev("health", "2026-11-09T15:00:00.000Z", { type: "vaccine", vaccine: "rabies" }, { parent_id: VISIT });
  const alone = ev("health", "2026-11-02T15:00:00.000Z", { type: "vaccine", vaccine: "dhpp", dose: 1 });

  it("are found by parent_id, oldest first; one logged on its own is not at the visit", () => {
    expect(vaccinesWith([visit, dhpp, rabies, alone], VISIT).map((e) => e.id)).toEqual([dhpp.id, rabies.id]);
    expect(vaccinesWith([visit, dhpp, rabies, alone], VISIT2)).toEqual([]);
  });

  it("follow the visit through a correction (the link stays on the old id) and are gone with a deleted shot", () => {
    const corrected = ev("health", "2026-11-09T15:00:00.000Z", { type: "vet", reasons: ["vaccines"] }, { id: VISIT2, voids: VISIT, note: "shots" });
    const events = [visit, dhpp, rabies, corrected];
    expect(vaccinesWith(events, VISIT2).map((e) => e.id)).toEqual([dhpp.id, rabies.id]);
    const del = ev("void", "2026-11-09T16:00:00.000Z", {}, { voids: rabies.id });
    expect(vaccinesWith([...events, del], VISIT2).map((e) => e.id)).toEqual([dhpp.id]);
  });

  it("the visit's line in the feed lists them", () => {
    const events = [visit, dhpp, rabies];
    expect(describeEvent(visit, [], events).detail).toBe("Vaccines · gave DHPP · dose 1, Rabies");
  });

  it("earlierDoses counts live entries of that vaccine up to a time, not itself", () => {
    const later = ev("health", "2026-12-01T15:00:00.000Z", { type: "vaccine", vaccine: "dhpp", dose: 2 });
    expect(earlierDoses([dhpp, alone, later], "dhpp", "2026-11-20T00:00:00.000Z")).toBe(2);
    expect(earlierDoses([dhpp, alone, later], "dhpp", "2026-11-20T00:00:00.000Z", alone.id)).toBe(1);
    expect(earlierDoses([dhpp, alone, later], "rabies", "2026-11-20T00:00:00.000Z")).toBe(0);
  });

  it("visitVaccineEntries makes one linked entry for each pick, in the list's order, with the dose the log implies", () => {
    const ids = new Map<string, string>([
      ["dhpp", SHOT],
      ["rabies", SHOT2],
    ]);
    const { entries, plans } = visitVaccineEntries({
      given: ["rabies", "dhpp"],
      visitId: VISIT,
      at: "2026-11-09T15:00:00.000Z",
      personId: PERSON,
      events: [alone],
      idFor: (v) => ids.get(v)!,
      planNext: true,
    });
    expect(entries.map((e) => [e.id, e.parent_id, e.person_id, e.at])).toEqual([
      [SHOT, VISIT, PERSON, "2026-11-09T15:00:00.000Z"],
      [SHOT2, VISIT, PERSON, "2026-11-09T15:00:00.000Z"],
    ]);
    expect(entries[0].details).toEqual({ type: "vaccine", vaccine: "dhpp", dose: 2 });
    expect(entries[1].details).toEqual({ type: "vaccine", vaccine: "rabies" });
    expect(plans[SHOT].title).toBe("Vaccine · DHPP · dose 3");
    expect(plans[SHOT2].title).toBe("Vaccine · Rabies");
    expect(plans[SHOT2].due_on).toBe("2027-11-09");
    expect(visitVaccineEntries({ given: ["rabies"], visitId: VISIT, at: "2026-11-09T15:00:00.000Z", personId: null, events: [], idFor: () => SHOT, planNext: false }).plans).toEqual({});
    expect(visitVaccineEntries({ given: [], visitId: VISIT, at: "2026-11-09T15:00:00.000Z", personId: null, events: [], idFor: () => SHOT, planNext: true }).entries).toEqual([]);
  });
});

describe("the migration lando_vaccines", () => {
  const dir = resolve(__dirname, "../../../supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const name = files.find((f) => f.endsWith("_lando_vaccines.sql"))!;
  const sql = readFileSync(resolve(dir, name), "utf8");
  const code = sql.replace(/--.*$/gm, "");

  it("is the newest file in the folder, so it is applied last", () => {
    expect(name).toBeDefined();
    expect(files.at(-1)).toBe(name);
  });

  it("is only the lock timeout and the function, a replace and never a constraint swap", () => {
    expect(code).toContain("create or replace function lando.details_ok(kind text, details jsonb)");
    expect(code).toContain("set search_path = ''");
    expect(code).not.toMatch(/\b(drop|delete|alter\s+table|add\s+constraint)\b/i);
    expect(code).toMatch(/set local lock_timeout = '5s';/);
  });

  it("lists the same vaccines as the app, and a dose of 1 to 6", () => {
    const list = code.match(/details ->> 'vaccine' IN \(([^)]*)\)/)![1];
    expect([...list.matchAll(/'([^']*)'/g)].map((m) => m[1])).toEqual([...VACCINE_IDS]);
    const branch = code.slice(code.indexOf("'vaccine' THEN"), code.indexOf("'medication' THEN"));
    expect(branch).toContain(`(details ->> 'dose')::numeric BETWEEN 1 AND ${DOSE_MAX} AND (details ->> 'dose')::numeric % 1 = 0`);
  });

  it("allows exactly the keys the app writes for a vaccine, and no reasons or issue", () => {
    const branch = code.slice(code.indexOf("'vaccine' THEN"), code.indexOf("'medication' THEN"));
    expect(branch).toContain("ARRAY['type', 'vaccine']");
    expect(branch).toContain("ARRAY['type', 'vaccine', 'dose', 'photos', 'names', 'note_id']");
    expect(branch).not.toContain("reasons");
    expect(branch).not.toContain("'issue'");
  });

  it("keeps the vet, issue and medication shapes of lando_note_links unchanged", () => {
    const prev = readFileSync(resolve(dir, files.find((f) => f.endsWith("_lando_note_links.sql"))!), "utf8").replace(/--.*$/gm, "");
    const medicationOn = (s: string) => s.slice(s.indexOf("details ->> 'type' = 'medication' THEN"), s.indexOf("WHEN 'note' THEN"));
    expect(medicationOn(code).replace(/\s+/g, " ")).toBe(medicationOn(prev).replace(/\s+/g, " "));
    const before = (s: string) => s.slice(s.indexOf("create or replace function"), s.indexOf("WHEN 'health' THEN"));
    expect(before(code)).toBe(before(prev));
  });
});

describe("the forms", () => {
  afterEach(() => cleanup());
  const props = () => ({
    people: [{ id: PERSON, display_name: "Tester" }],
    dogs: [],
    onAddDog: async () => ({ dog: null, error: null }),
    foods: [],
    onAddFood: async () => ({ food: null, error: null }),
    medications: [],
    onAddMedication: async () => ({ medication: null, error: null }),
    phonePerson: PERSON,
    events: [] as JournalEvent[],
    photoUrls: {},
    onPhotoUrl: () => {},
    remembered: {},
    weightUnit: "lb" as const,
    onLog: vi.fn<(...a: unknown[]) => void>(),
    onChange: vi.fn<(...a: unknown[]) => Promise<{ error: string | null }>>(async () => ({ error: null })),
    onUpcoming: vi.fn<(...a: unknown[]) => Promise<{ error: string | null }>>(async () => ({ error: null })),
    onPotty: () => {},
    unsaved: {},
    onRetry: () => {},
  });
  const open = (extra: Record<string, unknown> = {}) => {
    const p = { ...props(), ...extra };
    render(createElement(LogForm, { ...p, form: "health" } as never));
    return p;
  };
  const save = () => fireEvent.click(screen.getByRole("button", { name: /^Save/ }));

  it("Health's Type row offers Vaccine, and the Vaccine form is a vaccine pick and a dose pick, each half the row", () => {
    open({ healthType: "vaccine" });
    expect(screen.getByRole("radio", { name: "Vaccine" })).toBeTruthy();
    const pick = screen.getByLabelText("Vaccine", { selector: "select" }) as HTMLSelectElement;
    expect([...pick.options].map((o) => o.textContent)).toEqual(["Pick one…", "DHPP", "Bordetella", "Leptospirosis", "Rabies"]);
    expect(pick.className).toContain("w-full");
    // The dose box appears for a vaccine with a number, and not for one without.
    expect(screen.queryByLabelText("Dose")).toBeNull();
    fireEvent.change(pick, { target: { value: "rabies" } });
    expect(screen.queryByLabelText("Dose")).toBeNull();
    fireEvent.change(pick, { target: { value: "dhpp" } });
    expect((screen.getByLabelText("Dose") as HTMLSelectElement).value).toBe("1");
  });

  it("the dose opens on one more than those logged, until it is touched", () => {
    const first = ev("health", "2026-11-01T15:00:00.000Z", { type: "vaccine", vaccine: "dhpp", dose: 1 });
    open({ healthType: "vaccine", events: [first] });
    fireEvent.change(screen.getByLabelText("Vaccine", { selector: "select" }), { target: { value: "dhpp" } });
    const dose = screen.getByLabelText("Dose") as HTMLSelectElement;
    expect(dose.value).toBe("2");
    fireEvent.change(dose, { target: { value: "5" } });
    expect(dose.value).toBe("5");
  });

  it("Save without a vaccine says to pick one and logs nothing", () => {
    const p = open({ healthType: "vaccine" });
    save();
    expect(screen.getByRole("alert").textContent).toContain("Pick the vaccine");
    expect(p.onLog).not.toHaveBeenCalled();
  });

  it("Save logs the vaccine and offers the next dose as a plan, on the suggested day", () => {
    const p = open({ healthType: "vaccine" });
    fireEvent.change(screen.getByLabelText("Vaccine", { selector: "select" }), { target: { value: "rabies" } });
    // The offer is ticked, shows the suggested day in the When row's date box, and says the interval.
    expect((screen.getByLabelText("Plan the next dose") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/Usually 1 year on/)).toBeTruthy();
    save();
    expect(p.onLog).toHaveBeenCalledTimes(1);
    const [body, then, plans] = p.onLog.mock.calls[0] as [{ id: string; kind: string; details: unknown; note: string | null; parent_id?: string }, unknown[], Record<string, { kind: string; title: string; due_on: string }>];
    expect(body).toMatchObject({ kind: "health", details: { type: "vaccine", vaccine: "rabies" }, note: null });
    expect(body.parent_id).toBeUndefined();
    expect(then).toEqual([]);
    const plan = plans[body.id];
    expect(plan).toMatchObject({ kind: "vaccine", title: "Vaccine · Rabies" });
    expect(plan.due_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(plan.due_on > new Date().toISOString().slice(0, 10)).toBe(true);
  });

  it("unticking the offer logs the vaccine with no plan", () => {
    const p = open({ healthType: "vaccine" });
    fireEvent.change(screen.getByLabelText("Vaccine", { selector: "select" }), { target: { value: "bordetella" } });
    fireEvent.click(screen.getByLabelText("Plan the next dose"));
    save();
    expect(p.onLog.mock.calls[0]).toHaveLength(2);
  });

  it("a day typed in the next dose box is the day planned", () => {
    const p = open({ healthType: "vaccine" });
    fireEvent.change(screen.getByLabelText("Vaccine", { selector: "select" }), { target: { value: "bordetella" } });
    const boxes = screen.getAllByLabelText("Date") as HTMLInputElement[];
    expect(boxes).toHaveLength(2); // the next dose's, then the When row's
    fireEvent.change(boxes[0], { target: { value: "2027-01-15" } });
    save();
    const [body, , plans] = p.onLog.mock.calls[0] as [{ id: string }, unknown, Record<string, { due_on: string }>];
    expect(plans[body.id].due_on).toBe("2027-01-15");
  });

  it("a vaccine dated in the future is a plan, not an entry, and offers no further plan", () => {
    const p = open({ healthType: "vaccine" });
    fireEvent.change(screen.getByLabelText("Vaccine", { selector: "select" }), { target: { value: "dhpp" } });
    const when = screen.getAllByLabelText("Date").at(-1) as HTMLInputElement;
    fireEvent.change(when, { target: { value: "2099-01-01" } });
    expect(screen.queryByLabelText("Plan the next dose")).toBeNull();
    save();
    expect(p.onLog).not.toHaveBeenCalled();
    expect(p.onUpcoming).toHaveBeenCalledTimes(1);
    expect(p.onUpcoming.mock.calls[0][0]).toMatchObject({ kind: "vaccine", title: "Vaccine · DHPP · dose 1", due_on: "2099-01-01" });
  });

  it("a correction opens on its vaccine and dose and offers no plan", () => {
    const e = ev("health", "2026-11-01T15:00:00.000Z", { type: "vaccine", vaccine: "leptospirosis", dose: 2 });
    open({ event: e, events: [e] });
    expect((screen.getByLabelText("Vaccine", { selector: "select" }) as HTMLSelectElement).value).toBe("leptospirosis");
    expect((screen.getByLabelText("Dose") as HTMLSelectElement).value).toBe("2");
    expect(screen.queryByLabelText("Plan the next dose")).toBeNull();
  });

  it("a Done on a planned dose opens the Vaccine form on its vaccine and dose", () => {
    const done = donePrefill({ kind: "vaccine", title: "Vaccine · DHPP · dose 3", note: null, due_on: "2026-11-05", due_time: null });
    open({ healthType: "vaccine", done });
    expect((screen.getByLabelText("Vaccine", { selector: "select" }) as HTMLSelectElement).value).toBe("dhpp");
    expect((screen.getByLabelText("Dose") as HTMLSelectElement).value).toBe("3");
  });

  it("a vet visit has Vaccines given; each pick is its own linked entry, saved after the visit, with its plan", () => {
    const p = open({ healthType: "vet" });
    fireEvent.change(screen.getByLabelText("Why"), { target: { value: "vaccines" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Puppy shots" } });
    const chips = screen.getByRole("group", { name: "Vaccines given" });
    expect(chips.querySelectorAll("button")).toHaveLength(4);
    // Nothing picked: no offer and no entries.
    expect(screen.queryByLabelText("Plan the next doses")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "DHPP" }));
    fireEvent.click(screen.getByRole("button", { name: "Rabies" }));
    expect(screen.getByRole("button", { name: "DHPP" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Plan the next doses") as HTMLInputElement).checked).toBe(true);
    save();
    const [visit, then, plans] = p.onLog.mock.calls[0] as [{ id: string; at: string }, { id: string; parent_id: string; at: string; details: unknown }[], Record<string, { title: string }>];
    expect(then).toHaveLength(2);
    expect(then.map((t) => t.details)).toEqual([
      { type: "vaccine", vaccine: "dhpp", dose: 1 },
      { type: "vaccine", vaccine: "rabies" },
    ]);
    for (const t of then) {
      expect(t.parent_id).toBe(visit.id);
      expect(t.at).toBe(visit.at);
    }
    expect(Object.values(plans).map((x) => x.title)).toEqual(["Vaccine · DHPP · dose 2", "Vaccine · Rabies"]);
    expect(Object.keys(plans)).toEqual(then.map((t) => t.id));
  });

  it("a vet visit with no vaccines picked saves as it always did, and a correction has no Vaccines given", () => {
    const p = open({ healthType: "vet" });
    fireEvent.change(screen.getByLabelText("Why"), { target: { value: "checkup" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Fine" } });
    save();
    expect(p.onLog.mock.calls[0]).toHaveLength(2);
    expect(p.onLog.mock.calls[0][1]).toEqual([]);
    cleanup();
    const visit = ev("health", "2026-11-01T15:00:00.000Z", { type: "vet", reasons: ["checkup"] }, { note: "x" });
    open({ event: visit, events: [visit] });
    expect(screen.queryByRole("group", { name: "Vaccines given" })).toBeNull();
  });

  it("the Calendar's Add a plan offers Vaccine", () => {
    const src = readFileSync(resolve(__dirname, "../app/Calendar.tsx"), "utf8");
    expect(src).toContain('healthType: "vaccine"');
  });
});
