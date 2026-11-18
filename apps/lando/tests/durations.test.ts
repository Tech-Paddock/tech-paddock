// @vitest-environment jsdom
// #64: every length of time is chips, never a number box, with one set on every form: 5, 15, 30, 45 and 60+ min (Potty's
// Time outside, Fun's Length, Training's Time). Stored values stay minutes, and an older entry's own number still shows.
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import LogForm from "@/app/LogForm";
import { describe as describeEvent, type FormKind, type JournalEvent } from "@/lib/events";

// Invented ids. Nothing here is a real record (RULES.md, Never 2).
const PERSON = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
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
function open(form: FormKind, extra: Record<string, unknown> = {}) {
  const p = { ...props(), ...extra };
  render(createElement(LogForm, { ...p, form } as never));
  return p;
}
afterEach(() => cleanup());

const FACES = ["5 min", "15 min", "30 min", "45 min", "60+ min"];
const group = (name: string) => screen.getByRole("group", { name });
const faces = (name: string) => within(group(name)).getAllByRole("button").map((b) => b.textContent);
const on = (name: string) => within(group(name)).queryAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent);
const tap = (name: string, face: string) => fireEvent.click(within(group(name)).getByRole("button", { name: face }));
const save = () => fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
const exercise = (type: "walk" | "playtime" | "training", minutes: number) =>
  ({
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    kind: "exercise",
    at: "2026-10-19T21:05:00.000Z",
    person_id: PERSON,
    details: { type, where: "outside", minutes, treats: 0, ...(type === "training" ? { commands: [] } : {}) },
    note: null,
    voids: null,
    created_at: "2026-10-19T21:05:00.000Z",
  }) as unknown as JournalEvent;
const pottyEvent = (minutes: number) =>
  ({
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccd",
    kind: "potty",
    at: "2026-10-19T21:05:00.000Z",
    person_id: PERSON,
    details: { what: "pee", where: "outside", leash: "leashed", minutes },
    note: null,
    voids: null,
    created_at: "2026-10-19T21:05:00.000Z",
  }) as unknown as JournalEvent;

describe("one set of length chips on every form (#64)", () => {
  it("Potty's Time outside, Fun's Length and Training's Time are the same five chips", () => {
    open("potty");
    expect(faces("Time outside, minutes")).toEqual(FACES);
    cleanup();
    open("fun");
    expect(faces("Length, minutes")).toEqual(FACES);
    cleanup();
    open("training");
    expect(faces("Time, minutes")).toEqual(FACES);
  });

  it("no number box is left for a length of time", () => {
    for (const form of ["potty", "fun", "training"] as FormKind[]) {
      cleanup();
      open(form);
      expect(document.querySelector('input[type="number"][id="f-mins"]'), form).toBeNull();
      expect(screen.queryByLabelText(/Length \(min\)|Time \(min\)/), form).toBeNull();
    }
  });

  it("Potty's chips are optional: nothing on a new entry, a tap picks one and a second tap clears it", () => {
    const p = open("potty");
    expect(on("Time outside, minutes")).toEqual([]);
    tap("Time outside, minutes", "30 min");
    expect(on("Time outside, minutes")).toEqual(["30 min"]);
    tap("Time outside, minutes", "30 min");
    expect(on("Time outside, minutes")).toEqual([]);
    tap("Time outside, minutes", "60+ min");
    fireEvent.click(screen.getByLabelText("Pee"));
    save();
    expect((p.onLog.mock.calls[0][0] as { details: { minutes: number } }).details.minutes).toBe(60);
  });

  it("Fun and Training open on 15 min, a tap saves the chip's minutes, and a picked chip stays picked", () => {
    for (const [form, name, face, minutes] of [
      ["fun", "Length, minutes", "45 min", 45],
      ["training", "Time, minutes", "5 min", 5],
      ["training", "Time, minutes", "60+ min", 60],
    ] as const) {
      cleanup();
      const p = open(form);
      expect(on(name)).toEqual(["15 min"]);
      tap(name, face);
      expect(on(name)).toEqual([face]);
      tap(name, face);
      expect(on(name)).toEqual([face]); // not optional: a second tap keeps it
      save();
      expect((p.onLog.mock.calls[0][0] as { details: { minutes: number } }).details.minutes, `${form} ${face}`).toBe(minutes);
    }
  });

  it("Food has no length chips", () => {
    open("food");
    expect(screen.queryByRole("group", { name: /minutes/ })).toBeNull();
  });
});

describe("older entries with other minute values still show and keep their minutes (#64)", () => {
  it("a Fun entry at 20 min opens with no chip picked, and saving untouched keeps 20", () => {
    const p = open("fun", { event: exercise("walk", 20) });
    expect(on("Length, minutes")).toEqual([]);
    save();
    expect((p.onChange.mock.calls[0][0] as { details: { minutes: number } }).details.minutes).toBe(20);
  });

  it("a Training entry at 90 min opens on 60+, and saving untouched keeps 90; tapping another chip changes it", () => {
    const p = open("training", { event: exercise("training", 90) });
    expect(on("Time, minutes")).toEqual(["60+ min"]);
    tap("Time, minutes", "60+ min"); // already on: a no-op, never a silent 90 to 60
    save();
    expect((p.onChange.mock.calls[0][0] as { details: { minutes: number } }).details.minutes).toBe(90);
    cleanup();
    const q = open("training", { event: exercise("training", 90) });
    tap("Time, minutes", "30 min");
    save();
    expect((q.onChange.mock.calls[0][0] as { details: { minutes: number } }).details.minutes).toBe(30);
  });

  it("a Potty entry at 10 or 90 min opens with no chip (10) or 60+ (90), and saving untouched keeps the number", () => {
    for (const [old, picked] of [
      [10, []],
      [90, ["60+ min"]],
    ] as const) {
      cleanup();
      const p = open("potty", { event: pottyEvent(old) });
      expect(on("Time outside, minutes")).toEqual(picked);
      save();
      expect((p.onChange.mock.calls[0][0] as { details: { minutes: number } }).details.minutes).toBe(old);
    }
  });

  it("the feed still reads every stored value: N min, and 60+ for the longest chip", () => {
    const row = (details: Record<string, unknown>) => describeEvent({ kind: "exercise", details: { type: "walk", where: "outside", treats: 0, ...details } }).detail;
    expect(row({ minutes: 20 })).toContain("20 min");
    expect(row({ minutes: 90 })).toContain("90 min");
    const potty = (minutes: number) => describeEvent({ kind: "potty", details: { what: "pee", where: "outside", minutes } }).detail;
    expect(potty(20)).toBe("outside · 20 min");
    expect(potty(90)).toBe("outside · 90 min");
    expect(potty(60)).toBe("outside · 60+ min");
  });
});
