import { describe, expect, it } from "vitest";
import {
  FORM_KINDS,
  FUN_TYPES,
  InvalidEvent,
  emptyFeedText,
  feedDays,
  formOf,
  happenedAt,
  kindOfForm,
  parseDetails,
  treatEntry,
  treatsWith,
  type FeedRow,
  type JournalEvent,
} from "@/lib/events";
import { AMOUNT_PICKER_MAX, amountOptions, formatAmount } from "@/lib/foods";
import { fromDateInput } from "@/lib/localtime";

// TEC-136. Invented ids and entries; nothing here is a real person or dog.
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

/** A local time on a day in October 2026, as ISO. */
const local = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString();
const NOW = new Date(2026, 9, 23, 20, 0);

function ev(over: Partial<JournalEvent> & Pick<JournalEvent, "kind" | "at">): JournalEvent {
  return { id: uuid(), person_id: null, details: {}, note: null, voids: null, created_at: over.at, ...over };
}
const pee = (at: string, created_at = at) => ev({ kind: "potty", at, created_at, details: { what: "pee", where: "outside" } });
const exercise = (type: string, at: string) =>
  ev({ kind: "exercise", at, details: { type, where: "outside", with_dogs: false, minutes: 15, treats: 0 } });
const treat = (at: string) =>
  ev({
    kind: "food",
    at,
    details: { type: "treat", item_id: "misc", item_name: "Misc", kcal_per: null, unit: null, amount: 1 },
  });
const row = (e: JournalEvent): FeedRow<string> => ({ kind: e.kind, at: e.at, created_at: e.created_at, item: e.id });

describe("feed order — by when it happened, newest first", () => {
  it("orders by `at`, never by when it was logged", () => {
    // Logged in the evening about the morning: it still sits below the noon one.
    const morning = pee(local(23, 8), local(23, 19));
    const noon = pee(local(23, 12), local(23, 12));
    const [today] = feedDays([row(morning), row(noon)], NOW);
    expect(today.rows.map((r) => r.item)).toEqual([noon.id, morning.id]);
  });

  it("breaks a tie on `at` by the later save, and puts an unsaved row first", () => {
    const at = local(23, 9);
    const first = pee(at, local(23, 9, 1));
    const second = pee(at, local(23, 9, 2));
    const unsaved: FeedRow<string> = { kind: "potty", at, created_at: null, item: "pending" };
    const [today] = feedDays([row(first), unsaved, row(second)], NOW);
    expect(today.rows.map((r) => r.item)).toEqual(["pending", second.id, first.id]);
  });

  it("orders a weight at noon of its day, whatever time it was logged at", () => {
    const old = ev({ kind: "weight", at: local(22, 7, 13), details: { value: 7, unit: "lb" } });
    expect(happenedAt(old)).toBe(Date.parse(fromDateInput("2026-10-22")!));
    const evening = pee(local(22, 18));
    const morning = pee(local(22, 9));
    const [day] = feedDays([row(morning), row(old), row(evening)], NOW);
    expect(day.rows.map((r) => r.item)).toEqual([evening.id, old.id, morning.id]);
  });
});

describe("feed days — a heading per local day", () => {
  it("groups by local day, newest day first, labelled Today, Yesterday, then a date", () => {
    const rows = [pee(local(21, 23, 30)), pee(local(23, 0, 5)), pee(local(22, 0, 0)), pee(local(23, 7))].map(row);
    const days = feedDays(rows, NOW);
    expect(days.map((d) => d.day)).toEqual(["2026-10-23", "2026-10-22", "2026-10-21"]);
    expect(days.map((d) => d.label)).toEqual(["Today", "Yesterday", "Oct 21"]);
    expect(days.map((d) => d.rows.length)).toEqual([2, 1, 1]);
  });

  it("is empty with nothing, and says so per filter", () => {
    expect(feedDays([], NOW)).toEqual([]);
    expect(emptyFeedText(null)).toBe("Nothing logged yet.");
    expect(emptyFeedText("training")).toBe("No training entries yet.");
    expect(emptyFeedText("fun")).toBe("No fun entries yet.");
  });
});

describe("Fun and Training — two forms, one kind", () => {
  it("has five forms in the button order", () => {
    expect(FORM_KINDS).toEqual(["potty", "food", "fun", "training", "weight"]);
  });

  it("saves both as exercise", () => {
    expect(kindOfForm("fun")).toBe("exercise");
    expect(kindOfForm("training")).toBe("exercise");
    expect(kindOfForm("potty")).toBe("potty");
    expect(kindOfForm("weight")).toBe("weight");
  });

  it("opens and filters a walk or playtime as Fun, a training as Training", () => {
    expect(formOf(exercise("walk", local(23, 9)))).toBe("fun");
    expect(formOf(exercise("playtime", local(23, 9)))).toBe("fun");
    expect(formOf(exercise("training", local(23, 9)))).toBe("training");
    expect(formOf(treat(local(23, 9)))).toBe("food");
    expect(formOf(ev({ kind: "void", at: local(23, 9) }))).toBeNull();
  });

  it("Fun offers no training type", () => {
    expect(FUN_TYPES).toEqual(["walk", "playtime"]);
  });

  it("keeps the exercise shape: a training still carries its commands", () => {
    const d = parseDetails("exercise", { type: "training", where: "inside", with_dogs: false, minutes: 10, treats: 1, commands: ["sit"] });
    expect(d).toEqual({ type: "training", where: "inside", with_dogs: false, minutes: 10, treats: 1, commands: ["sit"] });
  });
});

describe("amount scroller — eighths", () => {
  it("offers no amount, then every eighth up to the end", () => {
    const o = amountOptions();
    expect(o[0]).toBeNull();
    expect(o[1]).toBe(0.125);
    expect(o.length).toBe(1 + AMOUNT_PICKER_MAX * 8);
    expect(o[o.length - 1]).toBe(AMOUNT_PICKER_MAX);
    for (let i = 2; i < o.length; i++) expect((o[i] as number) - (o[i - 1] as number)).toBeCloseTo(0.125, 9);
  });

  it("shows eighths as fractions, reduced", () => {
    expect([0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1, 1.125, 2.375].map(formatAmount)).toEqual([
      "1/8",
      "1/4",
      "3/8",
      "1/2",
      "5/8",
      "3/4",
      "7/8",
      "1",
      "1 1/8",
      "2 3/8",
    ]);
  });

  it("keeps an amount it opened on that is not an eighth, in its place", () => {
    const o = amountOptions(1 / 3, null);
    const i = o.indexOf(1 / 3);
    expect(i).toBeGreaterThan(0);
    expect(o[i - 1]).toBe(0.25);
    expect(o[i + 1]).toBe(0.375);
    expect(amountOptions(30)).toContain(30);
    expect(amountOptions(0.5).length).toBe(amountOptions().length);
  });

  it("every option passes the stored bounds", () => {
    for (const a of amountOptions()) {
      expect(() => parseDetails("food", { type: "meal", item_id: "misc", amount: a })).not.toThrow();
    }
  });
});

describe("Training's Treats pop-up — a food treat at the session's time", () => {
  const at = "2026-10-23T16:04:31.250Z";
  const person = uuid();

  it("logs a food treat at the training's exact time and person", () => {
    const t = { id: uuid(), item_id: "freeze-dried-beef-hearts", amount: 2 };
    const body = treatEntry(t, at, person);
    expect(body).toEqual({
      id: t.id,
      kind: "food",
      at,
      person_id: person,
      note: null,
      details: {
        type: "treat",
        item_id: "freeze-dried-beef-hearts",
        item_name: "Freeze-dried beef hearts",
        kcal_per: 1.33,
        unit: "piece",
        amount: 2,
      },
    });
  });

  it("refuses a treat not in the list, like any form", () => {
    expect(() => treatEntry({ id: uuid(), item_id: "nope", amount: 1 }, at, null)).toThrow(InvalidEvent);
  });

  it("a correction finds the live treats at the session's time, and only those", () => {
    const training = ev({ kind: "exercise", at, details: { type: "training", where: "inside", with_dogs: false, minutes: 10, treats: 2 } });
    const a = treat(at);
    const b = treat("2026-10-23T16:04:31.250+00:00"); // the database's spelling of the same instant
    const voided = treat(at);
    const del = ev({ kind: "void", at: local(23, 17), voids: voided.id });
    const later = treat("2026-10-23T16:04:32.250Z");
    const meal = ev({ kind: "food", at, details: { type: "meal", item_id: "misc", item_name: "Misc", kcal_per: null, unit: null, amount: null } });
    expect(treatsWith([training, a, b, voided, del, later, meal], training).map((e) => e.id)).toEqual([a.id, b.id]);
  });
});
