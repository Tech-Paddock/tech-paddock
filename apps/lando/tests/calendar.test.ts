// TEC-234: the Calendar tab. The rules are pure (lib/calendar.ts) and tested directly; the screen is rendered to
// markup (there is no DOM here). Invented entries only.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import Calendar from "@/app/Calendar";
import {
  MAX_DOTS,
  calendarDays,
  canPlanOn,
  dayDots,
  dayHeading,
  dayWords,
  monthGrid,
  monthLabel,
  monthOf,
  plannedWhen,
  planTone,
  shiftMonth,
  swipeStep,
} from "@/lib/calendar";
import { describe as describeEvent, type JournalEvent } from "@/lib/events";
import type { Upcoming } from "@/lib/upcoming";

let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const ev = (kind: JournalEvent["kind"], details: Record<string, unknown>, at: Date, extra: Partial<JournalEvent> = {}): JournalEvent => ({
  id: id(),
  kind,
  at: at.toISOString(),
  person_id: null,
  details,
  note: null,
  voids: null,
  created_at: at.toISOString(),
  ...extra,
});
const potty = (at: Date, where = "outside") => ev("potty", { what: "pee", where }, at);
const plan = (due_on: string, over: Partial<Upcoming> = {}): Upcoming => ({
  id: id(),
  kind: "vet",
  title: "Vet visit",
  due_on,
  due_time: null,
  note: null,
  repeat_every: null,
  repeat_unit: null,
  status: "open",
  done_on: null,
  done_event: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  ...over,
});

describe("the month grid", () => {
  it("is whole weeks, Sunday first, with the month's days in order", () => {
    const grid = monthGrid({ year: 2026, month: 11 }); // Nov 1 2026 is a Sunday
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid[0][0]).toEqual({ day: "2026-11-01", date: 1, inMonth: true });
    const inMonth = grid.flat().filter((c) => c.inMonth);
    expect(inMonth.map((c) => c.date)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(grid.length).toBe(5);
  });
  it("pads with the neighbouring months' days, across a year end", () => {
    const grid = monthGrid({ year: 2026, month: 1 }); // Jan 1 2026 is a Thursday
    expect(grid[0][0].day).toBe("2025-12-28");
    expect(grid[0][0].inMonth).toBe(false);
    expect(grid[0][4]).toEqual({ day: "2026-01-01", date: 1, inMonth: true });
    expect(monthGrid({ year: 2026, month: 2 }).length).toBe(4); // Feb 2026 starts on a Sunday and has 28 days
  });
  it("steps months across year ends and labels them", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 3 }, -15)).toEqual({ year: 2024, month: 12 });
    expect(monthOf("2026-11-08")).toEqual({ year: 2026, month: 11 });
    expect(monthLabel({ year: 2026, month: 11 })).toContain("2026");
  });
});

describe("what lands on a day", () => {
  const nov8 = new Date(2026, 10, 8, 9);
  it("groups live entries by the phone's day, newest first", () => {
    const a = potty(new Date(2026, 10, 8, 8));
    const b = potty(new Date(2026, 10, 8, 10));
    const c = potty(new Date(2026, 10, 9, 8));
    const days = calendarDays([a, b, c], []);
    expect(days.get("2026-11-08")!.entries.map((e) => e.id)).toEqual([b.id, a.id]);
    expect(days.get("2026-11-09")!.entries).toHaveLength(1);
  });
  it("drops a corrected or deleted entry, and never lists a note or a void", () => {
    const old = potty(nov8);
    const fix = ev("potty", { what: "poop", where: "outside" }, nov8, { voids: old.id });
    const gone = potty(nov8);
    const del = ev("void", {}, nov8, { voids: gone.id });
    const note = ev("note", { text: "ask the vet" }, nov8);
    const day = calendarDays([old, fix, gone, del, note], []).get("2026-11-08")!;
    expect(day.entries.map((e) => e.id)).toEqual([fix.id]);
  });
  it("lists only open plans, soonest time first, and an overdue one on its own day", () => {
    const late = plan("2026-11-08", { due_time: "15:00" });
    const early = plan("2026-11-08", { due_time: "09:00", kind: "medication", title: "Pill · 5 mg" });
    const untimed = plan("2026-11-08");
    const done = plan("2026-11-08", { status: "done" });
    const cancelled = plan("2026-11-08", { status: "cancelled" });
    const overdue = plan("2026-10-30");
    const days = calendarDays([], [late, early, untimed, done, cancelled, overdue]);
    expect(days.get("2026-11-08")!.plans.map((p) => p.id)).toEqual([untimed.id, early.id, late.id]);
    expect(days.get("2026-10-30")!.plans).toEqual([overdue]);
  });
});

describe("the dots", () => {
  it("shows one dot per kind: filled for entries, a ring for plans, in the feed's order", () => {
    const days = calendarDays(
      [ev("food", { type: "meal" }, new Date(2026, 10, 8, 7)), potty(new Date(2026, 10, 8, 8)), potty(new Date(2026, 10, 8, 9))],
      [plan("2026-11-08"), plan("2026-11-08", { kind: "other", title: "Training" }), plan("2026-11-08", { kind: "other", title: "Something of its own" })]
    );
    expect(dayDots(days.get("2026-11-08"))).toEqual({ entries: ["potty", "food"], plans: ["training", "health", null] });
  });
  it("shows an inside potty as an accident, and caps each style", () => {
    const t = new Date(2026, 10, 8, 8);
    const day = calendarDays(
      [potty(t, "inside"), ev("weight", { value: 5, unit: "lb" }, t), ev("health", { type: "vet" }, t), ev("food", { type: "meal" }, t)],
      []
    ).get("2026-11-08");
    const dots = dayDots(day);
    expect(dots.entries).toHaveLength(MAX_DOTS);
    expect(dayDots(undefined)).toEqual({ entries: [], plans: [] });
    const accidentOnly = calendarDays([potty(t, "inside")], []).get("2026-11-08");
    expect(dayDots(accidentOnly).entries).toEqual(["accident"]);
  });
  it("colours a plan by the form it came from", () => {
    expect(planTone({ kind: "vaccine", title: "Vaccine" })).toBe("health");
    expect(planTone({ kind: "medication", title: "Pill" })).toBe("health");
    expect(planTone({ kind: "other", title: "Weight" })).toBe("weight");
    expect(planTone({ kind: "other", title: "Groomer" })).toBeNull();
  });
  it("reads a day aloud", () => {
    const days = calendarDays([potty(new Date(2026, 10, 8, 8))], [plan("2026-11-08")]);
    expect(dayWords("2026-11-08", days.get("2026-11-08"))).toMatch(/1 plan, 1 entry$/);
    expect(dayWords("2026-11-09", undefined)).toMatch(/nothing$/);
    expect(dayHeading("2026-11-08", "2026-11-08")).toMatch(/^Today, /);
    expect(dayHeading("2026-11-09", "2026-11-08")).toMatch(/, /);
  });
});

describe("adding a plan on a day", () => {
  it("opens on a time that reads as the future, so the form saves a plan", () => {
    const now = new Date(2026, 10, 8, 14, 30);
    expect(plannedWhen("2026-11-12", now)).toBe("2026-11-12T09:00");
    expect(plannedWhen("2026-11-08", now)).toBe("2026-11-08T15:00");
    expect(plannedWhen("2026-11-08", new Date(2026, 10, 8, 23, 40))).toBe("2026-11-08T23:59");
  });
  it("is offered on today and later days only", () => {
    expect(canPlanOn("2026-11-08", "2026-11-08")).toBe(true);
    expect(canPlanOn("2026-12-01", "2026-11-08")).toBe(true);
    expect(canPlanOn("2026-11-07", "2026-11-08")).toBe(false);
  });
  it("is wired to the form: LogForm takes the day and Journal passes it, with notes already out of the entries", () => {
    const form = readFileSync(resolve(__dirname, "../app/LogForm.tsx"), "utf8");
    expect(form).toMatch(/plannedWhen\(planDay/);
    const journal = readFileSync(resolve(__dirname, "../app/Journal.tsx"), "utf8");
    expect(journal).toMatch(/planDay=\{open\.planDay\}/);
    expect(journal).toContain("onAddPlan={(day, form, healthType) => setOpen({ form, healthType, planDay: day })}");
    expect(journal).toMatch(/<Calendar[\s\S]*?entries=\{entries\}/);
    expect(journal).toContain("const entries = useMemo(() => (loaded ? withoutNotes(loaded.events) : []), [loaded]);");
  });
});

describe("swiping", () => {
  it("steps on a long mostly-sideways swipe only", () => {
    expect(swipeStep(-80, 5)).toBe(1);
    expect(swipeStep(80, -5)).toBe(-1);
    expect(swipeStep(-30, 0)).toBe(0);
    expect(swipeStep(-80, 70)).toBe(0);
  });
});

describe("the Calendar screen", () => {
  const entry = potty(new Date(2026, 10, 8, 9));
  const render = (over: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(Calendar, {
        entries: [entry],
        upcoming: [plan("2026-11-08")],
        upcomingError: null,
        loaded: true,
        today: "2026-11-08",
        describeEntry: (e: JournalEvent) => describeEvent(e),
        nameOf: () => null,
        onDone: async () => {},
        onEditPlan: () => {},
        onOpenEntry: () => {},
        onAddPlan: () => {},
        ...over,
      })
    );
  it("marks today, shows both dot styles and lists the day's plan and entry", () => {
    const html = render();
    expect(html).toContain('aria-current="date"');
    expect(html).toContain("lando-cal-dot");
    expect(html).toContain("lando-cal-plan");
    expect(html).toContain("Add a plan");
    expect(html).toContain("Done: Vet visit");
    expect(html).toContain("Tap an entry to correct or delete it.");
  });
  it("opens on today, which can take a plan, and says what it holds", () => {
    const html = render({ entries: [], upcoming: [] });
    expect(html).toContain("Today, Nov 8");
    expect(html).toContain("Nothing on this day.");
    expect(html).toContain("Add a plan");
  });
  it("lists no entry from a note and shows a failed plans read", () => {
    const note = ev("note", { text: "ask the vet" }, new Date(2026, 10, 8, 9));
    const html = render({ entries: [note], upcoming: null, upcomingError: "offline" });
    expect(html).not.toContain("ask the vet");
    expect(html).toContain("Couldn&#x27;t load plans. (offline)");
  });
});
