// A zone with a DST change inside the window, set before any Date is made, so
// "the phone's local day" is not quietly UTC. Node re-reads TZ when it is set.
process.env.TZ = "America/New_York";

import { describe, expect, it } from "vitest";
import { about, accidentTrend, dailyAverage, dayStarts, perDay, type DayRow } from "@/lib/analytics";
import type { JournalEvent } from "@/lib/events";

// Invented ids. Nothing here is a real person or a real dog's record.
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

function ev(kind: JournalEvent["kind"], at: Date, details: Record<string, unknown> = {}, voids: string | null = null): JournalEvent {
  return { id: uuid(), kind, at: at.toISOString(), person_id: null, details, note: null, voids, created_at: at.toISOString() };
}
const potty = (at: Date, what: string, where = "outside") => ev("potty", at, { what, where });
const food = (at: Date, type: "meal" | "treat") =>
  ev("food", at, { type, item_id: "misc", item_name: "Misc", kcal_per: null, unit: null, amount: 1 });
const session = (at: Date, type: string, minutes: number) =>
  ev("exercise", at, { type, where: "outside", with_dogs: false, minutes, treats: 0 });

// Local times, read on the phone. Tuesday 20 October 2026, mid-afternoon.
const local = (m: number, d: number, h = 12, min = 0) => new Date(2026, m - 1, d, h, min);
const NOW = local(10, 20, 15, 0);

describe("dayStarts", () => {
  it("runs in New York time (EDT, then EST), or the tests below prove nothing", () => {
    expect(local(10, 20).getTimezoneOffset()).toBe(240);
    expect(local(11, 10).getTimezoneOffset()).toBe(300);
  });

  it("is fourteen local midnights, oldest first, ending today", () => {
    const s = dayStarts(NOW);
    expect(s).toHaveLength(14);
    expect(s[13]).toEqual(local(10, 20, 0));
    expect(s[0]).toEqual(local(10, 7, 0));
    for (const d of s) expect([d.getHours(), d.getMinutes()]).toEqual([0, 0]);
  });

  it("stays on midnight across a DST change, where subtracting 24 h would not", () => {
    // US clocks fall back on 1 November 2026.
    const s = dayStarts(local(11, 10, 9));
    expect(s.map((d) => d.getHours())).toEqual(Array(14).fill(0));
    expect(s.map((d) => d.getDate())).toEqual([28, 29, 30, 31, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("perDay — one row per local day", () => {
  it("puts 23:59 on its own day and 00:00 on the next", () => {
    const rows = perDay([potty(local(10, 18, 23, 59), "pee"), potty(local(10, 19, 0, 0), "pee")], NOW);
    expect(rows[11].pee).toBe(1); // 18 Oct
    expect(rows[12].pee).toBe(1); // 19 Oct
  });

  it("uses the phone's day, not UTC's: 21:00 in New York is already tomorrow in UTC", () => {
    const rows = perDay([food(local(10, 19, 21, 0), "meal")], NOW);
    expect(rows[12].meal).toBe(1);
    expect(rows[13].meal).toBe(0);
  });

  it("drops anything before the first day or after today", () => {
    const rows = perDay(
      [potty(local(10, 6, 23, 59), "pee"), potty(local(10, 7, 0, 0), "pee"), potty(local(10, 21, 0, 0), "pee")],
      NOW
    );
    expect(rows.reduce((s, r) => s + r.pee, 0)).toBe(1);
    expect(rows[0].pee).toBe(1);
  });

  it("counts an evening on the right day across the DST change", () => {
    // 31 Oct 23:30 EDT and 1 Nov 23:30 EST: a 24 h grid would shift one of them.
    const at = local(11, 10, 9);
    const rows = perDay([food(local(10, 31, 23, 30), "treat"), food(local(11, 1, 23, 30), "treat")], at);
    expect(rows[3].treat).toBe(1); // 31 Oct
    expect(rows[4].treat).toBe(1); // 1 Nov
  });

  it("counts inside as an accident only; outside both as one pee and one poop", () => {
    const rows = perDay(
      [potty(local(10, 20, 8), "both"), potty(local(10, 20, 9), "pee", "inside"), potty(local(10, 20, 10), "poop", "inside")],
      NOW
    );
    expect(rows[13]).toMatchObject({ pee: 1, poop: 1, accident: 2 });
  });

  it("counts a No potty as nothing: no pee, no poop, no accident, inside or out", () => {
    const rows = perDay([potty(local(10, 20, 8), "none"), potty(local(10, 20, 9), "none", "inside")], NOW);
    expect(rows[13]).toMatchObject({ pee: 0, poop: 0, accident: 0 });
  });

  it("skips voided entries and counts a correction once, on its own day", () => {
    const deleted = potty(local(10, 20, 7), "pee");
    const wrongDay = food(local(10, 20, 8), "meal");
    const moved = { ...food(local(10, 19, 8), "meal"), voids: wrongDay.id };
    const rows = perDay(
      [deleted, ev("void", local(10, 20, 7, 5), {}, deleted.id), wrongDay, moved, potty(local(10, 20, 11), "pee")],
      NOW
    );
    expect(rows[13]).toMatchObject({ pee: 1, meal: 0 });
    expect(rows[12].meal).toBe(1);
  });

  it("sums exercise by type and minutes; weights count nowhere", () => {
    const rows = perDay(
      [
        session(local(10, 20, 7), "walk", 20),
        session(local(10, 20, 9), "training", 10),
        session(local(10, 20, 13), "walk", 15),
        ev("weight", local(10, 20, 8), { value: 7, unit: "lb" }),
      ],
      NOW
    );
    expect(rows[13]).toMatchObject({ walk: 2, playtime: 0, training: 1, minutes: 45, pee: 0, meal: 0 });
  });
});

describe("summaries", () => {
  const row = (over: Partial<DayRow>, i: number): DayRow => ({
    start: local(10, 7 + i, 0),
    pee: 0,
    poop: 0,
    accident: 0,
    meal: 0,
    treat: 0,
    walk: 0,
    playtime: 0,
    training: 0,
    minutes: 0,
    ...over,
  });
  const days = (fill: (i: number) => Partial<DayRow>) => Array.from({ length: 14 }, (_, i) => row(fill(i), i));

  it("averages complete days only, from the first one logged", () => {
    // Nothing for the first ten days; three full days of 6 meals... and today's 1 does not count.
    const rows = days((i) => (i < 10 ? {} : i === 13 ? { meal: 1 } : { meal: 3, treat: i }));
    expect(dailyAverage(rows, ["meal"])).toBe(3);
    expect(dailyAverage(rows, ["treat"])).toBe(11);
  });

  it("has no average before a full day is logged", () => {
    expect(dailyAverage(days((i) => (i === 13 ? { pee: 4 } : {})), ["pee"])).toBeNull();
    expect(about(null)).toBe("—");
    expect(about(6.4444)).toBe("6.4");
  });

  it("says which way accidents are going, this week against the last", () => {
    expect(accidentTrend(days((i) => ({ accident: i < 7 ? 1 : 0 })))).toBe("0 accidents in the last 7 days, down from 7 the 7 before.");
    expect(accidentTrend(days((i) => ({ accident: i === 13 ? 1 : 0 })))).toBe("1 accident in the last 7 days, up from 0 the 7 before.");
    expect(accidentTrend(days((i) => ({ accident: i === 0 || i === 13 ? 1 : 0 })))).toBe(
      "1 accident in the last 7 days, the same as the 7 before."
    );
    expect(accidentTrend(days(() => ({})))).toBe("No accidents in 14 days.");
  });
});
