// #73: a Repeat on a time that is now or past is never refused. The entry is logged and the repeat becomes a plan whose first
// date is the next one after now: the entry's time plus the interval, stepped forward until it is in the future. Pure.
import { describe, expect, it } from "vitest";
import { firstRepeatAfter } from "@/lib/future";

const NOW = new Date(2026, 10, 17, 14, 38); // Tue Nov 17 2026, 2:38 PM, the phone's clock

describe("the first date of a repeat after now", () => {
  it("weekly: steps from the entry's own day until it is after now", () => {
    // Oct 5 9:30 AM, weekly: Nov 16 9:30 AM is already past, so Nov 23.
    expect(firstRepeatAfter({ day: "2026-10-05", time: "09:30", every: 1, unit: "week", now: NOW })).toEqual({ day: "2026-11-23", time: "09:30" });
    // Every 2 weeks: Oct 19, Nov 2, Nov 16 (past), Nov 30.
    expect(firstRepeatAfter({ day: "2026-10-05", time: "09:30", every: 2, unit: "week", now: NOW })).toEqual({ day: "2026-11-30", time: "09:30" });
  });

  it("monthly: a short month is clamped and never drifts the day", () => {
    expect(firstRepeatAfter({ day: "2026-08-31", time: "09:30", every: 1, unit: "month", now: NOW })).toEqual({ day: "2026-11-30", time: "09:30" });
    expect(firstRepeatAfter({ day: "2026-10-05", time: "09:30", every: 1, unit: "month", now: NOW })).toEqual({ day: "2026-12-05", time: "09:30" });
  });

  it("yearly: the same day next year, or later still for an old entry", () => {
    expect(firstRepeatAfter({ day: "2026-10-05", time: "09:30", every: 1, unit: "year", now: NOW })).toEqual({ day: "2027-10-05", time: "09:30" });
    expect(firstRepeatAfter({ day: "2023-02-28", time: "09:30", every: 1, unit: "year", now: NOW })).toEqual({ day: "2027-02-28", time: "09:30" });
  });

  it("an entry made now repeats one interval on", () => {
    expect(firstRepeatAfter({ day: "2026-11-17", time: "14:38", every: 1, unit: "week", now: NOW })).toEqual({ day: "2026-11-24", time: "14:38" });
    expect(firstRepeatAfter({ day: "2026-11-17", time: "14:38", every: 3, unit: "month", now: NOW })).toEqual({ day: "2027-02-17", time: "14:38" });
  });

  it("the time of day decides a step that lands on today", () => {
    // Weekly from Nov 10: the next step is today, Nov 17. At 5:00 PM that is still ahead of 2:38 PM; at 9:30 AM it is not.
    expect(firstRepeatAfter({ day: "2026-11-10", time: "17:00", every: 1, unit: "week", now: NOW })).toEqual({ day: "2026-11-17", time: "17:00" });
    expect(firstRepeatAfter({ day: "2026-11-10", time: "09:30", every: 1, unit: "week", now: NOW })).toEqual({ day: "2026-11-24", time: "09:30" });
  });

  it("a day with no time (a weight) is the first day after today, never today", () => {
    expect(firstRepeatAfter({ day: "2026-11-10", time: null, every: 1, unit: "week", now: NOW })).toEqual({ day: "2026-11-24", time: null });
    expect(firstRepeatAfter({ day: "2026-10-17", time: null, every: 1, unit: "month", now: NOW })).toEqual({ day: "2026-12-17", time: null });
  });

  it("an entry already in the future is stepped once, as a repeat of a plan would", () => {
    expect(firstRepeatAfter({ day: "2026-12-01", time: "08:00", every: 1, unit: "week", now: NOW })).toEqual({ day: "2026-12-08", time: "08:00" });
  });

  it("refuses a day that is not a day", () => {
    expect(() => firstRepeatAfter({ day: "soon", time: null, every: 1, unit: "week", now: NOW })).toThrow();
  });
});
