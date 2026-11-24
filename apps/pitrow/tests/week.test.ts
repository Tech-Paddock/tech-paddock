import { describe, expect, it } from "vitest";
import type { CalendarWeekEvent } from "@/lib/calendar-client";
import { weekDays, weekLabel, weekStartOf } from "@/lib/days";
import type { Chore, Completion } from "@/lib/types";
import { cadenceLabel, choresForDay, clock, eventsForDay, isDue, timeOf, whenLabel } from "@/lib/week";

// Invented chores and events: nothing here is a real household's.
const chore = (over: Partial<Chore>): Chore => ({ id: "c1", title: "Bins", cadence: "daily", weekdays: null, every_n: null, start_on: "2026-11-01", assignee_id: null, ...over });
const tick = (over: Partial<Completion>): Completion => ({ id: "t1", chore_id: "c1", day: "2026-11-24", person_id: "p1", ...over });

describe("days of the week", () => {
  it("the week starts on the Sunday on or before the day", () => {
    expect(weekStartOf("2026-11-24")).toBe("2026-11-22"); // a Tuesday
    expect(weekStartOf("2026-11-22")).toBe("2026-11-22");
    expect(weekStartOf("2026-11-28")).toBe("2026-11-22");
    expect(weekDays("2026-11-29")).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05"]);
    expect(weekLabel("2026-11-22")).toBe("Nov 22 – 28");
    expect(weekLabel("2026-11-29")).toBe("Nov 29 – Dec 5");
  });
});

describe("isDue", () => {
  it("never before its start", () => {
    expect(isDue(chore({ start_on: "2026-11-25" }), "2026-11-24")).toBe(false);
    expect(isDue(chore({ start_on: "2026-11-25" }), "2026-11-25")).toBe(true);
  });
  it("once is its day alone", () => {
    const c = chore({ cadence: "once", start_on: "2026-11-24" });
    expect([isDue(c, "2026-11-23"), isDue(c, "2026-11-24"), isDue(c, "2026-11-25")]).toEqual([false, true, false]);
  });
  it("weekly is its weekdays (0 Sunday)", () => {
    const c = chore({ cadence: "weekly", weekdays: [2, 5] });
    expect(weekDays("2026-11-22").map((d) => isDue(c, d))).toEqual([false, false, true, false, false, true, false]);
  });
  it("every N days counts from the start", () => {
    const c = chore({ cadence: "every_n", every_n: 3, start_on: "2026-11-22" });
    expect(weekDays("2026-11-22").map((d) => isDue(c, d))).toEqual([true, false, false, true, false, false, true]);
  });
});

describe("choresForDay", () => {
  it("a daily chore's tick counts for its own day only", () => {
    const rows = choresForDay([chore({})], [tick({})], "2026-11-24", "2026-11-24");
    expect(rows[0].ticks).toHaveLength(1);
    expect(choresForDay([chore({})], [tick({})], "2026-11-23", "2026-11-24")[0].ticks).toHaveLength(0);
  });

  it("a once-only chore that slipped past undone is carried onto today as overdue, and only today", () => {
    const c = chore({ cadence: "once", start_on: "2026-11-20" });
    expect(choresForDay([c], [], "2026-11-24", "2026-11-24")).toEqual([{ chore: c, overdue: true, ticks: [] }]);
    expect(choresForDay([c], [], "2026-11-23", "2026-11-24")).toEqual([]);
    expect(choresForDay([c], [], "2026-11-20", "2026-11-24")[0].overdue).toBe(false);
  });

  it("a once-only chore ticked on any day is done, and is not carried", () => {
    const c = chore({ cadence: "once", start_on: "2026-11-20" });
    const done = tick({ day: "2026-11-24" });
    expect(choresForDay([c], [done], "2026-11-24", "2026-11-24")).toEqual([]);
    expect(choresForDay([c], [done], "2026-11-20", "2026-11-24")[0].ticks).toEqual([done]);
  });
});

describe("events", () => {
  const ev = (over: Partial<CalendarWeekEvent>): CalendarWeekEvent => ({ calendar: "Household", title: "Dentist", start: "2026-11-24T09:30", end: "2026-11-24T10:30", all_day: false, ...over });

  it("an all-day event shows on every day it spans, inclusive of its last", () => {
    const trip = ev({ title: "Trip", start: "2026-11-23", end: "2026-11-25", all_day: true });
    expect(["2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"].map((d) => eventsForDay([trip], d).length)).toEqual([0, 1, 1, 1, 0]);
  });

  it("all-day come first, then by start; a timed event belongs to its start day", () => {
    const late = ev({ title: "Late", start: "2026-11-24T18:00", end: "2026-11-25T01:00" });
    const early = ev({ title: "Early", start: "2026-11-24T08:00", end: "2026-11-24T08:30" });
    const all = ev({ title: "Holiday", start: "2026-11-24", end: "2026-11-24", all_day: true });
    expect(eventsForDay([late, early, all], "2026-11-24").map((e) => e.title)).toEqual(["Holiday", "Early", "Late"]);
    expect(eventsForDay([late], "2026-11-25")).toEqual([]);
  });

  it("leaves out Pit Row's own calendar, whose events are the chores already shown", () => {
    expect(eventsForDay([ev({ calendar: "Pit Row", title: "Bins" })], "2026-11-24")).toEqual([]);
  });

  it("reads wall-clock times without converting them", () => {
    expect(clock("2026-11-24T00:05")).toBe("12:05 am");
    expect(clock("2026-11-24T09:30")).toBe("9:30 am");
    expect(clock("2026-11-24T12:00")).toBe("12 pm");
    expect(clock("2026-11-24T17:45")).toBe("5:45 pm");
    expect(timeOf(new Date(2026, 10, 24, 13, 5))).toBe("1:05 pm");
    expect(whenLabel(ev({}), "2026-11-24")).toBe("9:30 am – 10:30 am");
    expect(whenLabel(ev({ start: "2026-11-24T18:00", end: "2026-11-25T01:00" }), "2026-11-24")).toBe("6 pm");
    expect(whenLabel(ev({ start: "2026-11-24", end: "2026-11-24", all_day: true }), "2026-11-24")).toBe("All day");
  });
});

describe("cadenceLabel", () => {
  it("says it plainly", () => {
    expect(cadenceLabel({ cadence: "weekly", weekdays: [1, 4], every_n: null })).toBe("Mon, Thu");
    expect(cadenceLabel({ cadence: "every_n", weekdays: null, every_n: 3 })).toBe("Every 3 days");
    expect(cadenceLabel({ cadence: "once", weekdays: null, every_n: null })).toBe("Once");
  });
});
