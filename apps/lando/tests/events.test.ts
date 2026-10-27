import { describe, expect, it } from "vitest";
import {
  InvalidEvent,
  checkVoid,
  correctionAt,
  describe as describeEvent,
  displayUnit,
  formatAgo,
  growthPoints,
  isAccident,
  latestWeight,
  liveEvents,
  parseNewEvent,
  sinceLast,
  DOGS_ADD,
  DOGS_KEPT,
  DOGS_MULTIPLE,
  DOGS_NONE,
  dogsFromPick,
  dogsPickFor,
  type JournalEvent,
} from "@/lib/events";
import { nameBoxWidth } from "@/lib/names";

// Invented ids. Nothing here is a real person or a real dog's record.
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

function ev(over: Partial<JournalEvent> & Pick<JournalEvent, "kind" | "at">): JournalEvent {
  return {
    id: uuid(),
    person_id: null,
    details: {},
    note: null,
    voids: null,
    created_at: over.at,
    ...over,
  };
}

const pee = (at: string, over: Partial<JournalEvent> = {}) =>
  ev({ kind: "potty", at, details: { what: "pee", where: "outside" }, ...over });
const poop = (at: string, over: Partial<JournalEvent> = {}) =>
  ev({ kind: "potty", at, details: { what: "poop", where: "outside" }, ...over });
const meal = (at: string, over: Partial<JournalEvent> = {}) =>
  ev({
    kind: "food",
    at,
    details: { type: "meal", item_id: "misc", item_name: "Misc", kcal_per: null, unit: null, amount: null },
    ...over,
  });
const walk = (at: string) =>
  ev({ kind: "exercise", at, details: { type: "walk", where: "outside", with_dogs: false, minutes: 15, treats: 0 } });

const NOW = new Date("2026-10-20T15:00:00Z");

describe("liveEvents — corrections and deletes void, never rewrite", () => {
  it("keeps an event nothing voids", () => {
    const a = pee("2026-10-20T14:00:00Z");
    expect(liveEvents([a])).toEqual([a]);
  });

  it("drops a deleted event and the void itself", () => {
    const a = pee("2026-10-20T14:00:00Z");
    const del = ev({ kind: "void", at: "2026-10-20T14:05:00Z", voids: a.id });
    expect(liveEvents([a, del])).toEqual([]);
  });

  it("shows the correction in place of the original", () => {
    const a = meal("2026-10-20T08:00:00Z");
    const fix = meal("2026-10-20T08:00:00Z", { voids: a.id });
    expect(liveEvents([a, fix])).toEqual([fix]);
  });

  it("follows a chain: a correction of a correction leaves only the last", () => {
    const a = ev({ kind: "weight", at: "2026-10-01T08:00:00Z", details: { value: 5, unit: "kg" } });
    const b = ev({ kind: "weight", at: "2026-10-01T08:00:00Z", voids: a.id, details: { value: 5.1, unit: "kg" } });
    const c = ev({ kind: "weight", at: "2026-10-01T08:00:00Z", voids: b.id, details: { value: 5.2, unit: "kg" } });
    expect(liveEvents([c, a, b])).toEqual([c]);
  });

  it("deleting a correction removes the entry entirely", () => {
    const a = meal("2026-10-20T10:00:00Z");
    const b = meal("2026-10-20T10:30:00Z", { voids: a.id });
    const del = ev({ kind: "void", at: "2026-10-20T11:00:00Z", voids: b.id });
    expect(liveEvents([a, b, del])).toEqual([]);
  });
});

describe("sinceLast — the pills", () => {
  it("takes the newest live pee, poop, food and exercise", () => {
    const p1 = pee("2026-10-20T12:00:00Z");
    const p2 = pee("2026-10-20T14:13:00Z");
    const po = poop("2026-10-20T09:00:00Z");
    const m = meal("2026-10-20T07:00:00Z");
    const w = walk("2026-10-20T06:00:00Z");
    const out = sinceLast([p2, po, p1, m, w], NOW);
    expect(out).toEqual({ pee: p2, poop: po, food: m, exercise: w });
  });

  it("counts both toward pee and poop", () => {
    const b = ev({ kind: "potty", at: "2026-10-20T14:00:00Z", details: { what: "both", where: "outside" } });
    const out = sinceLast([pee("2026-10-20T10:00:00Z"), b], NOW);
    expect(out.pee).toBe(b);
    expect(out.poop).toBe(b);
  });

  it("resets neither clock for a No potty", () => {
    const earlier = pee("2026-10-20T10:00:00Z");
    const none = ev({ kind: "potty", at: "2026-10-20T14:00:00Z", details: { what: "none", where: "outside", leash: "leashed" } });
    const out = sinceLast([earlier, none], NOW);
    expect(out.pee).toBe(earlier);
    expect(out.poop).toBeNull();
  });

  it("counts an accident inside toward its pee or poop clock", () => {
    const outside = pee("2026-10-20T10:00:00Z");
    const acc = ev({ kind: "potty", at: "2026-10-20T13:00:00Z", details: { what: "pee", where: "inside" } });
    const out = sinceLast([outside, acc], NOW);
    expect(out.pee).toBe(acc);
    expect(out.poop).toBeNull();
  });

  it("is null for a clock with nothing, never zero minutes", () => {
    expect(sinceLast([ev({ kind: "weight", at: "2026-10-20T14:00:00Z", details: { value: 3, unit: "kg" } })], NOW)).toEqual({
      pee: null,
      poop: null,
      food: null,
      exercise: null,
    });
  });

  it("falls back to the previous pee when the newest is deleted", () => {
    const old = pee("2026-10-20T12:00:00Z");
    const wrong = pee("2026-10-20T14:50:00Z");
    const del = ev({ kind: "void", at: "2026-10-20T14:51:00Z", voids: wrong.id });
    expect(sinceLast([old, wrong, del], NOW).pee).toBe(old);
  });

  it("uses a correction's time, not the original's", () => {
    const a = poop("2026-10-20T14:55:00Z");
    const fix = poop("2026-10-20T13:00:00Z", { voids: a.id, created_at: "2026-10-20T14:58:00Z" });
    const earlier = poop("2026-10-20T13:30:00Z");
    expect(sinceLast([a, fix, earlier], NOW).poop).toBe(earlier);
  });

  it("ignores an entry timed in the future", () => {
    const real = meal("2026-10-20T12:00:00Z");
    const typo = meal("2026-10-20T19:00:00Z");
    expect(sinceLast([real, typo], NOW).food).toBe(real);
  });

  it("breaks a tie on time by the later save", () => {
    const a = pee("2026-10-20T14:00:00Z", { created_at: "2026-10-20T14:00:01Z" });
    const b = pee("2026-10-20T14:00:00Z", { created_at: "2026-10-20T14:00:02Z" });
    expect(sinceLast([a, b], NOW).pee).toBe(b);
    expect(sinceLast([b, a], NOW).pee).toBe(b);
  });
});

describe("formatAgo — short enough for a pill", () => {
  const at = (minsAgo: number) => new Date(NOW.getTime() - minsAgo * 60_000).toISOString();
  it.each([
    [0, "now"],
    [0.5, "now"],
    [1, "1m"],
    [47, "47m"],
    [60, "1h"],
    [125, "2h 5m"],
    [9 * 60 + 59, "9h 59m"],
    [10 * 60 + 5, "10h"],
    [23 * 60 + 59, "23h"],
    [24 * 60, "1d"],
    [3 * 24 * 60 + 4 * 60 + 10, "3d 4h"],
    [12 * 24 * 60 + 5 * 60, "12d"],
  ])("%s minutes reads %s", (m, want) => {
    expect(formatAgo(at(m), NOW)).toBe(want);
  });

  it("never runs past six characters inside the 30 days read", () => {
    for (let m = 0; m < 30 * 24 * 60; m += 7) expect(formatAgo(at(m), NOW).length).toBeLessThanOrEqual(6);
  });
});

describe("growth", () => {
  it("plots live weights, oldest first, in kg", () => {
    const a = ev({ kind: "weight", at: "2026-10-10T08:00:00Z", details: { value: 4, unit: "kg" } });
    const b = ev({ kind: "weight", at: "2026-10-03T08:00:00Z", details: { value: 7, unit: "lb" } });
    const wrong = ev({ kind: "weight", at: "2026-10-15T08:00:00Z", details: { value: 40, unit: "kg" } });
    const del = ev({ kind: "void", at: "2026-10-15T08:01:00Z", voids: wrong.id });
    const pts = growthPoints([a, b, wrong, del]);
    expect(pts.map((p) => p.id)).toEqual([b.id, a.id]);
    expect(pts[0].kg).toBeCloseTo(3.175, 3);
    expect(pts[1].kg).toBe(4);
  });

  it("speaks the newest weight's unit, lb when there is none", () => {
    expect(displayUnit([])).toBe("lb");
    const a = ev({ kind: "weight", at: "2026-10-01T08:00:00Z", details: { value: 4, unit: "lb" } });
    const b = ev({ kind: "weight", at: "2026-10-09T08:00:00Z", details: { value: 3, unit: "kg" } });
    expect(displayUnit([b, a])).toBe("kg");
    expect(latestWeight([a, b])).toBe(b);
  });
});

describe("describe — a timeline row", () => {
  it("says an inside potty is an accident", () => {
    const acc = { kind: "potty" as const, details: { what: "both", where: "inside" } };
    expect(isAccident(acc)).toBe(true);
    expect(describeEvent(acc)).toEqual({ title: "Both", detail: "accident, inside" });
    expect(describeEvent({ kind: "potty", details: { what: "pee", where: "outside" } })).toEqual({ title: "Pee", detail: "outside" });
  });

  it("names the food and its amount in its own unit, never calories", () => {
    const d = describeEvent({
      kind: "food",
      details: { type: "meal", item_id: "x", item_name: "Kibble", kcal_per: 447, unit: "cup", amount: 0.333 },
    });
    expect(d).toEqual({ title: "Meal", detail: "Kibble · 1/3 cup" });
    expect(d.detail).not.toMatch(/kcal|447/);
    expect(
      describeEvent({ kind: "food", details: { type: "treat", item_id: "x", item_name: "Hearts", kcal_per: 1.33, unit: "piece", amount: 3 } }).detail
    ).toBe("Hearts · 3 pieces");
    expect(
      describeEvent({ kind: "food", details: { type: "treat", item_id: "misc", item_name: "Misc", kcal_per: null, unit: null, amount: 2 } }).detail
    ).toBe("Misc · 2");
  });

  it("lists an exercise session's parts", () => {
    expect(
      describeEvent({
        kind: "exercise",
        details: { type: "training", where: "inside", with_dogs: true, minutes: 10, treats: 6, commands: ["sit", "leave-it"] },
      })
    ).toEqual({ title: "Training", detail: "10 min · inside · with several dogs · 6 treats · Sit, Leave it" });
  });

  it("shows an outside potty's leash pick; an old entry without one reads as before", () => {
    expect(describeEvent({ kind: "potty", details: { what: "pee", where: "outside", leash: "unleashed" } }).detail).toBe("outside · unleashed");
    expect(describeEvent({ kind: "potty", details: { what: "both", where: "outside", leash: "pen" } }).detail).toBe("outside · in pen");
    expect(describeEvent({ kind: "potty", details: { what: "poop", where: "outside" } }).detail).toBe("outside");
  });

  it("reads a No potty as a trip out, never as an accident", () => {
    expect(describeEvent({ kind: "potty", details: { what: "none", where: "outside", leash: "pen" } })).toEqual({
      title: "No potty",
      detail: "outside · in pen",
    });
    const inside = { kind: "potty" as const, details: { what: "none", where: "inside" } };
    expect(describeEvent(inside)).toEqual({ title: "No potty", detail: "inside" });
    expect(isAccident(inside)).toBe(false);
  });

  it("reads an old multi-dog entry by name, as before the single pick", () => {
    const dogs = [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Dog A" },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Dog B" },
    ];
    const details = { type: "walk", where: "outside", minutes: 20, treats: 0, with_dogs: true, dogs: dogs.map((d) => d.id) };
    expect(describeEvent({ kind: "exercise", details }, dogs).detail).toBe("20 min · outside · with Dog A, Dog B");
  });

  it("names the dogs a session was with; Multiple and an old unnamed entry say with several dogs", () => {
    const dogs = [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Dog A" },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Dog B" },
    ];
    const base = { type: "walk", where: "outside", minutes: 20, treats: 0 };
    expect(
      describeEvent({ kind: "exercise", details: { ...base, with_dogs: true, dogs: [dogs[1].id, dogs[0].id] } }, dogs).detail
    ).toBe("20 min · outside · with Dog B, Dog A");
    expect(
      describeEvent({ kind: "exercise", details: { ...base, with_dogs: true, dogs: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"] } }, dogs).detail
    ).toBe("20 min · outside · with another dog");
    expect(describeEvent({ kind: "exercise", details: { ...base, with_dogs: true } }, dogs).detail).toBe("20 min · outside · with several dogs");
    expect(describeEvent({ kind: "exercise", details: { ...base, with_dogs: false } }).detail).toBe("20 min · outside");
  });

  it("rounds a weight to one decimal", () => {
    expect(describeEvent({ kind: "weight", details: { value: 4.26, unit: "kg" } })).toEqual({ title: "Weight", detail: "4.3 kg" });
  });
});

describe("parseNewEvent — what the server accepts", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  const potty = { what: "pee", where: "outside" };

  it("accepts a potty with no time, leaving now to the database", () => {
    expect(parseNewEvent({ id, kind: "potty", details: potty }, NOW)).toEqual({
      id, kind: "potty", at: null, person_id: null, details: potty, note: null, voids: null,
    });
  });

  it("refuses the old one-tap kinds, an unknown kind, a missing id and a non-UUID id", () => {
    expect(() => parseNewEvent({ id, kind: "pee" }, NOW)).toThrow(InvalidEvent);
    expect(() => parseNewEvent({ id, kind: "nap" }, NOW)).toThrow(InvalidEvent);
    expect(() => parseNewEvent({ kind: "potty", details: potty }, NOW)).toThrow(/id/);
    expect(() => parseNewEvent({ id: "1", kind: "potty", details: potty }, NOW)).toThrow(/id/);
  });

  it("needs every field a kind owns, and keeps only those", () => {
    expect(() => parseNewEvent({ id, kind: "potty", details: { what: "pee" } }, NOW)).toThrow(/where/);
    expect(() => parseNewEvent({ id, kind: "potty" }, NOW)).toThrow(/details/);
    expect(parseNewEvent({ id, kind: "potty", details: { ...potty, extra: 1 } }, NOW).details).toEqual(potty);
    expect(() => parseNewEvent({ id, kind: "potty", details: { what: "vomit", where: "inside" } }, NOW)).toThrow(/what/);
  });

  it("snapshots food from the catalogue, whatever the phone says", () => {
    const d = parseNewEvent(
      { id, kind: "food", details: { type: "treat", item_id: "freeze-dried-beef-hearts", amount: 3, item_name: "Free steak", kcal_per: 0 } },
      NOW
    ).details;
    expect(d).toEqual({
      type: "treat",
      item_id: "freeze-dried-beef-hearts",
      item_name: "Freeze-dried beef hearts",
      kcal_per: 1.33,
      unit: "piece",
      amount: 3,
    });
  });

  it("allows Misc with no calories and no amount; refuses an unknown food or a bad amount", () => {
    expect(parseNewEvent({ id, kind: "food", details: { type: "meal", item_id: "misc" } }, NOW).details).toEqual({
      type: "meal", item_id: "misc", item_name: "Misc", kcal_per: null, unit: null, amount: null,
    });
    expect(() => parseNewEvent({ id, kind: "food", details: { type: "meal", item_id: "steak" } }, NOW)).toThrow(/not in the list/);
    // A treat id is not a meal.
    expect(() => parseNewEvent({ id, kind: "food", details: { type: "meal", item_id: "bixbi-pocket-trainers-bacon" } }, NOW)).toThrow(/not in the list/);
    expect(() => parseNewEvent({ id, kind: "food", details: { type: "meal", item_id: "misc", amount: 0 } }, NOW)).toThrow(/amount/);
    expect(() => parseNewEvent({ id, kind: "food", details: { type: "meal", item_id: "misc", amount: "1/2" } }, NOW)).toThrow(/amount/);
  });

  it("checks an exercise session, and keeps commands only for training, in list order", () => {
    const base = { type: "walk", where: "outside", with_dogs: false, minutes: 15, treats: 0 };
    expect(parseNewEvent({ id, kind: "exercise", details: { ...base, commands: ["sit"] } }, NOW).details).toEqual(base);
    expect(
      parseNewEvent({ id, kind: "exercise", details: { ...base, type: "training", commands: ["heel", "sit", "sit"] } }, NOW).details
    ).toEqual({ ...base, type: "training", commands: ["sit", "heel"] });
    expect(() => parseNewEvent({ id, kind: "exercise", details: { ...base, type: "training", commands: ["roll over"] } }, NOW)).toThrow(/list/);
    expect(() => parseNewEvent({ id, kind: "exercise", details: { ...base, minutes: 0 } }, NOW)).toThrow(/minutes/);
    expect(() => parseNewEvent({ id, kind: "exercise", details: { ...base, minutes: 1.5 } }, NOW)).toThrow(/minutes/);
    expect(() => parseNewEvent({ id, kind: "exercise", details: { ...base, treats: -1 } }, NOW)).toThrow(/treats/);
    expect(() => parseNewEvent({ id, kind: "exercise", details: { ...base, with_dogs: "no" } }, NOW)).toThrow(/dogs/);
  });

  it("keeps a leash pick on an outside potty only", () => {
    for (const leash of ["leashed", "unleashed", "pen"]) {
      expect(parseNewEvent({ id, kind: "potty", details: { ...potty, leash } }, NOW).details).toEqual({ ...potty, leash });
    }
    // Old entries carry none and stay valid; null is none.
    expect(parseNewEvent({ id, kind: "potty", details: potty }, NOW).details).not.toHaveProperty("leash");
    expect(parseNewEvent({ id, kind: "potty", details: { ...potty, leash: null } }, NOW).details).toEqual(potty);
    expect(() => parseNewEvent({ id, kind: "potty", details: { what: "pee", where: "inside", leash: "leashed" } }, NOW)).toThrow(/outside only/);
    expect(() => parseNewEvent({ id, kind: "potty", details: { ...potty, leash: "loose" } }, NOW)).toThrow(/leash/);
    expect(() => parseNewEvent({ id, kind: "potty", details: { ...potty, leash: ["leashed"] } }, NOW)).toThrow(/leash/);
  });

  it("accepts a No potty, with its where and leash picks; refuses other values", () => {
    const none = { what: "none", where: "outside", leash: "unleashed" };
    expect(parseNewEvent({ id, kind: "potty", details: none }, NOW).details).toEqual(none);
    expect(parseNewEvent({ id, kind: "potty", details: { what: "none", where: "inside" } }, NOW).details).toEqual({ what: "none", where: "inside" });
    expect(() => parseNewEvent({ id, kind: "potty", details: { what: "neither", where: "outside" } }, NOW)).toThrow(/what must be/);
  });

  it("keeps the dogs an exercise was with: once each, picked order, only with dogs", () => {
    const base = { type: "walk", where: "outside", with_dogs: true, minutes: 15, treats: 0 };
    const dogA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const dogB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect(parseNewEvent({ id, kind: "exercise", details: { ...base, dogs: [dogB, dogA, dogB.toUpperCase()] } }, NOW).details).toEqual({
      ...base,
      dogs: [dogB, dogA],
    });
    // Old entries: with dogs, none named, still valid.
    expect(parseNewEvent({ id, kind: "exercise", details: base }, NOW).details).toEqual(base);
    // None picked is no key at all, never an empty list.
    expect(parseNewEvent({ id, kind: "exercise", details: { ...base, with_dogs: false, dogs: [] } }, NOW).details).not.toHaveProperty("dogs");
    expect(parseNewEvent({ id, kind: "exercise", details: { ...base, dogs: null } }, NOW).details).not.toHaveProperty("dogs");
    expect(() => parseNewEvent({ id, kind: "exercise", details: { ...base, with_dogs: false, dogs: [dogA] } }, NOW)).toThrow(/with other dogs/);
    expect(() => parseNewEvent({ id, kind: "exercise", details: { ...base, dogs: ["Dog A"] } }, NOW)).toThrow(/dogs must come from the list/);
    expect(() => parseNewEvent({ id, kind: "exercise", details: { ...base, dogs: dogA } }, NOW)).toThrow(/dogs must come from the list/);
    expect(() => parseNewEvent({ id, kind: "exercise", details: { ...base, dogs: [[dogA]] } }, NOW)).toThrow(/dogs must come from the list/);
    const many = Array.from({ length: 21 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(() => parseNewEvent({ id, kind: "exercise", details: { ...base, dogs: many } }, NOW)).toThrow(/at most 20/);
    expect(parseNewEvent({ id, kind: "exercise", details: { ...base, dogs: many.slice(0, 20) } }, NOW).details).toHaveProperty("dogs");
  });

  it("needs a positive number and a known unit for a weight", () => {
    expect(parseNewEvent({ id, kind: "weight", details: { value: 4.2, unit: "kg" } }, NOW).details).toEqual({ value: 4.2, unit: "kg" });
    expect(() => parseNewEvent({ id, kind: "weight", details: {} }, NOW)).toThrow(/above 0/);
    expect(() => parseNewEvent({ id, kind: "weight", details: { value: -1, unit: "kg" } }, NOW)).toThrow(/above 0/);
    expect(() => parseNewEvent({ id, kind: "weight", details: { value: "4", unit: "kg" } }, NOW)).toThrow(/above 0/);
    expect(() => parseNewEvent({ id, kind: "weight", details: { value: 4, unit: "stone" } }, NOW)).toThrow(/unit/);
  });

  it("refuses a time more than a day ahead, and an unreadable one", () => {
    expect(() => parseNewEvent({ id, kind: "potty", details: potty, at: "2026-10-22T15:00:00Z" }, NOW)).toThrow(/future/);
    expect(() => parseNewEvent({ id, kind: "potty", details: potty, at: "yesterday" }, NOW)).toThrow(/time/);
    expect(parseNewEvent({ id, kind: "potty", details: potty, at: "2026-10-20T10:00:00+02:00" }, NOW).at).toBe("2026-10-20T08:00:00.000Z");
  });

  it("makes a delete name its target and carry nothing else", () => {
    expect(() => parseNewEvent({ id, kind: "void" }, NOW)).toThrow(/name the entry/);
    expect(parseNewEvent({ id, kind: "void", voids: other, note: "x", details: { what: "y" }, at: "2026-10-01T00:00:00Z" }, NOW)).toEqual({
      id, kind: "void", at: null, person_id: null, details: {}, note: null, voids: other,
    });
    expect(() => parseNewEvent({ id, kind: "void", voids: id }, NOW)).toThrow(/itself/);
  });
});

describe("checkVoid — what may replace what", () => {
  const target = meal("2026-10-20T08:00:00Z");
  const details: Record<string, unknown> = {
    food: { type: "meal", item_id: "misc" },
    potty: { what: "pee", where: "outside" },
  };
  const next = (kind: string) => parseNewEvent({ id: uuid(), kind, voids: target.id, details: details[kind] }, NOW);

  it("allows a delete or a same-kind correction of a live entry", () => {
    expect(() => checkVoid(next("void"), target, false)).not.toThrow();
    expect(() => checkVoid(next("food"), target, false)).not.toThrow();
  });

  it("refuses a correction that changes the kind", () => {
    expect(() => checkVoid(next("potty"), target, false)).toThrow(/kind/);
  });

  it("refuses a missing target, a void target and an entry already replaced", () => {
    expect(() => checkVoid(next("void"), null, false)).toThrow(/does not exist/);
    const del = ev({ kind: "void", at: "2026-10-20T09:00:00Z", voids: target.id });
    expect(() => checkVoid(next("void"), del, false)).toThrow(/cannot be corrected/);
    expect(() => checkVoid(next("food"), target, true)).toThrow(/already changed/);
  });

  it("keeps the original time when a correction does not send one", () => {
    expect(correctionAt(next("food"), target)).toBe(target.at);
  });
});

describe("Other dogs — one pick (TEC-129)", () => {
  // Invented: no real dog's name is in the repo (charter, Never 2).
  const A = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Dog A" };
  const B = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Dog B" };
  const GONE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const base = { type: "walk", where: "outside", minutes: 15, treats: 0 };
  const saved = (pick: string, kept: string[] | null = null) =>
    parseNewEvent({ id: uuid(), kind: "exercise", details: { ...base, ...dogsFromPick(pick, kept) } }, new Date()).details;

  it("saves one dog by id, Multiple as with dogs and no ids, None as without", () => {
    expect(saved(A.id)).toEqual({ ...base, with_dogs: true, dogs: [A.id] });
    expect(saved(DOGS_MULTIPLE)).toEqual({ ...base, with_dogs: true });
    expect(saved(DOGS_NONE)).toEqual({ ...base, with_dogs: false });
    // Add dog is never a value that saves; if it were sent, it is none.
    expect(saved(DOGS_ADD)).toEqual({ ...base, with_dogs: false });
  });

  it("opens a new entry on None, and a correction on what it saved", () => {
    expect(dogsPickFor(null, [A, B])).toEqual({ pick: DOGS_NONE, kept: null });
    expect(dogsPickFor({ with_dogs: false }, [A, B])).toEqual({ pick: DOGS_NONE, kept: null });
    expect(dogsPickFor({ with_dogs: true, dogs: [B.id] }, [A, B])).toEqual({ pick: B.id, kept: null });
    // Multiple, or an entry from before the list: the same shape, opened on Multiple.
    expect(dogsPickFor({ with_dogs: true }, [A, B])).toEqual({ pick: DOGS_MULTIPLE, kept: null });
  });

  it("keeps an old multi-dog entry's dogs on a correction unless another pick is made", () => {
    const old = { with_dogs: true, dogs: [B.id, A.id] };
    const { pick, kept } = dogsPickFor(old, [A, B]);
    expect(pick).toBe(DOGS_KEPT);
    expect(saved(pick, kept)).toEqual({ ...base, with_dogs: true, dogs: [B.id, A.id] });
    expect(saved(A.id, kept)).toEqual({ ...base, with_dogs: true, dogs: [A.id] });
  });

  it("keeps a single dog no longer listed rather than showing the wrong one", () => {
    const { pick, kept } = dogsPickFor({ with_dogs: true, dogs: [GONE] }, [A, B]);
    expect(pick).toBe(DOGS_KEPT);
    expect(kept).toEqual([GONE]);
  });
});

describe("nameBoxWidth — a person box fits a name", () => {
  it("is the longest name plus one, between the floor and the cap, plus padding and arrow", () => {
    expect(nameBoxWidth(["Al", "Bea"])).toBe("calc(7ch + 2.75rem)");
    expect(nameBoxWidth(["Alexandra"])).toBe("calc(10ch + 2.75rem)");
    expect(nameBoxWidth(["x".repeat(40)])).toBe("calc(15ch + 2.75rem)");
    expect(nameBoxWidth([])).toBe("calc(7ch + 2.75rem)");
  });
});
