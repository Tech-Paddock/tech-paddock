// TEC-143: the day timeline, potty gaps, meal to poop, food against weight, weekly exercise.
// A zone with a DST change inside the window, set before any Date is made.
process.env.TZ = "America/New_York";

import { describe, expect, it } from "vitest";
import {
  TIMELINE_DAYS,
  dayMarks,
  dayTimeline,
  foodAgainstWeight,
  formatSpan,
  mealToPoop,
  median,
  nearestMark,
  peeGaps,
  perDay,
  stackLevels,
  typicalGaps,
  weeklyExercise,
} from "@/lib/analytics";
import type { JournalEvent } from "@/lib/events";

// Invented ids. Nothing here is a real person or a real dog's record.
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

function ev(kind: JournalEvent["kind"], at: Date, details: Record<string, unknown> = {}, voids: string | null = null): JournalEvent {
  return { id: uuid(), kind, at: at.toISOString(), person_id: null, details, note: null, voids, created_at: at.toISOString() };
}
const potty = (at: Date, what: string, where = "outside") => ev("potty", at, { what, where });
const meal = (at: Date, unit: string | null = "cup", amount: number | null = 1) =>
  ev("food", at, { type: "meal", item_id: "x", item_name: "X", kcal_per: null, unit, amount });
const treat = (at: Date) => ev("food", at, { type: "treat", item_id: "misc", item_name: "Misc", kcal_per: null, unit: null, amount: 1 });
const session = (at: Date, type: string, minutes: number) =>
  ev("exercise", at, { type, where: "outside", with_dogs: false, minutes, treats: 0 });
const weighed = (at: Date, value: number, unit = "lb") => ev("weight", at, { value, unit });

const local = (m: number, d: number, h = 12, min = 0) => new Date(2026, m - 1, d, h, min);
const NOW = local(10, 20, 15, 0); // Tuesday 20 October 2026, 3 p.m.
const HOUR = 3_600_000;

describe("dayMarks", () => {
  it("is one entry per day, oldest first, the same days as perDay", () => {
    const m = dayMarks([], NOW);
    expect(m).toHaveLength(14);
    expect(m.map((d) => d.start)).toEqual(perDay([], NOW).map((r) => r.start));
  });

  it("plots a live pee, poop, accident, meal and treat at their wall-clock hour", () => {
    const m = dayMarks(
      [
        potty(local(10, 20, 7, 30), "pee"),
        potty(local(10, 20, 8, 15), "poop"),
        potty(local(10, 20, 9, 0), "pee", "inside"),
        meal(local(10, 20, 7, 45)),
        treat(local(10, 20, 13, 6)),
      ],
      NOW
    )[13].marks;
    expect(m.map((x) => [x.kind, x.hour])).toEqual([
      ["pee", 7.5],
      ["meal", 7.75],
      ["poop", 8.25],
      ["accident", 9],
      ["treat", 13.1],
    ]);
  });

  it("makes both a pee and a poop, and an inside one a single accident", () => {
    const marks = dayMarks([potty(local(10, 20, 8), "both"), potty(local(10, 20, 9), "both", "inside")], NOW)[13].marks;
    expect(marks.map((x) => x.kind)).toEqual(["pee", "poop", "accident"]);
    expect(marks[2].what).toBe("both");
  });

  it("does not plot No potty, weights, exercise or voided entries", () => {
    const gone = potty(local(10, 20, 10), "pee");
    const marks = dayMarks(
      [
        potty(local(10, 20, 8), "none"),
        potty(local(10, 20, 8), "none", "inside"),
        weighed(local(10, 20, 8), 7),
        session(local(10, 20, 9), "walk", 20),
        gone,
        ev("void", local(10, 20, 11), {}, gone.id),
      ],
      NOW
    )[13].marks;
    expect(marks).toEqual([]);
  });

  it("agrees with perDay on every day's totals", () => {
    const events = [
      potty(local(10, 18, 23, 59), "both"),
      potty(local(10, 19, 0, 0), "pee"),
      potty(local(10, 19, 5), "poop", "inside"),
      potty(local(10, 20, 6), "none"),
      meal(local(10, 19, 8)),
      treat(local(10, 19, 9)),
      treat(local(10, 20, 9)),
    ];
    const rows = perDay(events, NOW);
    const marks = dayMarks(events, NOW);
    marks.forEach((d, i) => {
      const c = (k: string) => d.marks.filter((x) => x.kind === k).length;
      expect([c("pee"), c("poop"), c("accident"), c("meal"), c("treat")]).toEqual([
        rows[i].pee,
        rows[i].poop,
        rows[i].accident,
        rows[i].meal,
        rows[i].treat,
      ]);
    });
  });

  it("puts 23:59 on its own day, and keeps days on the calendar across a DST change", () => {
    // US clocks fall back on 1 November 2026: that day is 25 hours long.
    const now = local(11, 3, 9);
    const m = dayMarks([potty(local(10, 31, 23, 59), "pee"), potty(local(11, 1, 0, 5), "pee"), potty(local(11, 2, 0, 0), "pee")], now);
    const on = (d: number) => m.find((x) => x.start.getDate() === d && x.start.getMonth() === (d > 20 ? 9 : 10))!;
    expect(on(31).marks.map((x) => x.hour)).toEqual([23 + 59 / 60]);
    expect(on(1).marks.map((x) => x.hour.toFixed(2))).toEqual(["0.08"]);
    expect(m.find((x) => x.start.getDate() === 2)!.marks.map((x) => x.hour)).toEqual([0]);
  });
});

describe("stackLevels and nearestMark", () => {
  it("keeps marks that are far apart on level 0 and lifts close ones", () => {
    expect(stackLevels([1, 5, 9], 0.8)).toEqual([0, 0, 0]);
    expect(stackLevels([8, 8, 8.2, 8.4], 0.8)).toEqual([0, 1, 2, 2]);
    expect(stackLevels([8, 8.5, 9], 0.8)).toEqual([0, 1, 0]);
  });

  it("finds the nearest mark within reach, or none", () => {
    const marks = [{ hour: 7 }, { hour: 7.5 }, { hour: 12 }];
    expect(nearestMark(marks, 7.4, 1)).toEqual({ hour: 7.5 });
    expect(nearestMark(marks, 10, 1)).toBeNull();
    expect(nearestMark([], 3, 1)).toBeNull();
  });
});

describe("peeGaps — time between pees", () => {
  it("averages and finds the longest of the daytime gaps; both counts, poop does not", () => {
    const rows = peeGaps(
      [
        potty(local(10, 20, 8), "pee"),
        potty(local(10, 20, 9), "poop"), // not a pee
        potty(local(10, 20, 10), "both"),
        potty(local(10, 20, 14), "pee"),
        potty(local(10, 20, 11), "none"),
      ],
      NOW
    );
    expect(rows[13].pees).toBe(3);
    expect(rows[13].gaps).toEqual([2 * HOUR, 4 * HOUR]);
    expect(rows[13].average).toBe(3 * HOUR);
    expect(rows[13].longest).toBe(4 * HOUR);
  });

  it("counts an inside pee: it emptied the bladder", () => {
    const rows = peeGaps([potty(local(10, 20, 8), "pee"), potty(local(10, 20, 10), "pee", "inside")], NOW);
    expect(rows[13].gaps).toEqual([2 * HOUR]);
  });

  it("keeps the gap across midnight out of the daytime numbers and assigns it to the day it ends", () => {
    const rows = peeGaps(
      [
        potty(local(10, 19, 22), "pee"),
        potty(local(10, 20, 6), "pee"), // overnight: 8 h, ends on the 20th
        potty(local(10, 20, 9), "pee"),
      ],
      NOW
    );
    expect(rows[12].overnight).toBeNull(); // the 19th has one pee only
    expect(rows[12].gaps).toEqual([]);
    expect(rows[13].overnight).toBe(8 * HOUR);
    expect(rows[13].gaps).toEqual([3 * HOUR]);
    expect(rows[13].average).toBe(3 * HOUR);
    expect(rows[13].longest).toBe(3 * HOUR);
  });

  it("anchors the first day's overnight on a pee from before the window", () => {
    const rows = peeGaps([potty(local(10, 6, 23), "pee"), potty(local(10, 7, 7), "pee")], NOW);
    expect(rows[0].start).toEqual(local(10, 7, 0));
    expect(rows[0].overnight).toBe(8 * HOUR);
    expect(rows[0].pees).toBe(1);
  });

  it("has no daytime gap on a day with fewer than two pees, and no overnight with no earlier pee", () => {
    const [first, , , , , , , , , , , , , today] = peeGaps([potty(local(10, 20, 8), "pee")], NOW);
    expect(first.average).toBeNull();
    expect(today).toMatchObject({ pees: 1, average: null, longest: null, overnight: null });
  });

  it("is real elapsed time across a DST night", () => {
    // 10 p.m. on 31 Oct to 6 a.m. on 1 Nov is 9 hours when clocks fall back.
    const rows = peeGaps([potty(local(10, 31, 22), "pee"), potty(local(11, 1, 6), "pee")], local(11, 3, 9));
    expect(rows.find((r) => r.start.getDate() === 1 && r.start.getMonth() === 10)!.overnight).toBe(9 * HOUR);
  });

  it("summarises the window: median gap, median night, longest day", () => {
    const rows = peeGaps(
      [
        potty(local(10, 18, 8), "pee"),
        potty(local(10, 18, 10), "pee"),
        potty(local(10, 19, 7), "pee"), // overnight 21 h
        potty(local(10, 19, 12), "pee"), // 5 h
        potty(local(10, 20, 6), "pee"), // overnight 18 h
        potty(local(10, 20, 7), "pee"), // 1 h
      ],
      NOW
    );
    const t = typicalGaps(rows);
    expect(t.daytime).toBe(2 * HOUR);
    expect(t.overnight).toBe(19.5 * HOUR);
    expect(t.longest).toEqual({ start: local(10, 19, 0), ms: 5 * HOUR });
    expect(typicalGaps(peeGaps([], NOW))).toEqual({ daytime: null, overnight: null, longest: null });
  });

  it("formats a span", () => {
    expect(formatSpan(47 * 60_000)).toBe("47m");
    expect(formatSpan(125 * 60_000)).toBe("2h 5m");
    expect(formatSpan(3 * HOUR)).toBe("3h");
    expect(median([3, 1, 2, 10])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("mealToPoop", () => {
  it("measures a meal to the next poop and takes the median", () => {
    const r = mealToPoop(
      [
        meal(local(10, 19, 8)),
        potty(local(10, 19, 9), "poop"), // 60 min
        meal(local(10, 19, 12)),
        potty(local(10, 19, 14), "both"), // 120 min
        meal(local(10, 19, 18)),
        potty(local(10, 19, 20), "poop", "inside"), // 120 min, an accident still counts
      ],
      NOW
    );
    expect(r.matched).toBe(3);
    expect(r.median).toBe(120);
    expect(r.days[12].minutes).toEqual([60, 120, 120]);
    expect(r.days[12].median).toBe(120);
  });

  it("ignores a meal with no poop inside six hours, and a pee is not a poop", () => {
    const r = mealToPoop(
      [meal(local(10, 18, 8)), potty(local(10, 18, 9), "pee"), potty(local(10, 18, 14, 1), "poop"), meal(local(10, 18, 15)), potty(local(10, 18, 21), "poop")],
      NOW
    );
    // 8:00 -> 14:01 is 6 h 1 min: out. 15:00 -> 21:00 is exactly 6 h: in.
    expect(r.days[11].minutes).toEqual([360]);
    expect(r.days[11].none).toBe(1);
    expect(r.none).toBe(1);
    expect(r.matched).toBe(1);
  });

  it("lets the poop fall on the next day, counted on the meal's day", () => {
    const r = mealToPoop([meal(local(10, 18, 22)), potty(local(10, 19, 1), "poop")], NOW);
    expect(r.days[11].minutes).toEqual([180]);
    expect(r.days[12].minutes).toEqual([]);
  });

  it("leaves a meal whose window has not run out as pending, not as missed", () => {
    const r = mealToPoop([meal(local(10, 20, 13))], NOW); // 2 h ago at 3 p.m.
    expect(r).toMatchObject({ pending: 1, none: 0, matched: 0, median: null });
  });

  it("does not count treats, voided meals or a poop before the meal", () => {
    const gone = meal(local(10, 19, 8));
    const r = mealToPoop(
      [treat(local(10, 19, 8)), gone, ev("void", local(10, 19, 8, 5), {}, gone.id), potty(local(10, 19, 7), "poop")],
      NOW
    );
    expect(r).toMatchObject({ matched: 0, none: 0, pending: 0, median: null });
  });

  it("windows meals to the last 14 days", () => {
    const r = mealToPoop([meal(local(10, 5, 8)), potty(local(10, 5, 9), "poop")], NOW);
    expect(r.matched).toBe(0);
  });
});

describe("foodAgainstWeight", () => {
  it("sums meal amounts per day in the most common unit and says what it left out", () => {
    const f = foodAgainstWeight(
      [
        meal(local(10, 20, 8), "cup", 0.5),
        meal(local(10, 20, 17), "cup", 0.75),
        meal(local(10, 19, 8), "cup", 1),
        meal(local(10, 19, 12), "piece", 2), // another unit
        meal(local(10, 19, 18), "cup", null), // no amount
        treat(local(10, 20, 9)), // not a meal
      ],
      NOW,
      "lb"
    );
    expect(f.unit).toBe("cup");
    expect(f.days[13]).toMatchObject({ amount: 1.25, meals: 2 });
    expect(f.days[12]).toMatchObject({ amount: 1, meals: 1 });
    expect(f.otherUnit).toBe(1);
    expect(f.noAmount).toBe(1);
  });

  it("breaks a tie by unit name, and has no unit with no amounts at all", () => {
    expect(foodAgainstWeight([meal(local(10, 20, 8), "pop", 1), meal(local(10, 20, 9), "cup", 1)], NOW, "lb").unit).toBe("cup");
    const none = foodAgainstWeight([meal(local(10, 20, 8), "cup", null)], NOW, "lb");
    expect(none).toMatchObject({ unit: null, hasAmounts: false, noAmount: 1 });
  });

  it("sums the unit-less group (Misc) as its own unit", () => {
    const f = foodAgainstWeight([meal(local(10, 20, 8), null, 2), meal(local(10, 20, 9), null, 1)], NOW, "lb");
    expect(f).toMatchObject({ unit: null, hasAmounts: true });
    expect(f.days[13].amount).toBe(3);
  });

  it("puts the day's last weigh-in on its day, in the display unit", () => {
    const f = foodAgainstWeight(
      [weighed(local(10, 20, 8), 7.0), weighed(local(10, 20, 9), 3.2, "kg"), weighed(local(10, 18, 12), 6.5)],
      NOW,
      "lb"
    );
    expect(f.days[13].weight).toBe(7.1);
    expect(f.days[11].weight).toBe(6.5);
    expect(f.days[12].weight).toBeNull();
  });
});

describe("weeklyExercise", () => {
  const events = [
    session(local(10, 20, 8), "walk", 30), // week 4: the last 7 days are 14-20 Oct
    session(local(10, 14, 0), "training", 10), // first day of week 4
    session(local(10, 13, 23), "playtime", 20), // last day of week 3
    session(local(9, 24, 8), "walk", 15), // week 1: 23-29 Sep
    potty(local(9, 24, 7), "pee"),
  ];

  it("builds seven-day weeks ending today, split Fun and Training", () => {
    const w = weeklyExercise(events, NOW);
    expect(w).toHaveLength(4);
    expect(w[3]).toMatchObject({ fun: 30, training: 10, sessions: 2 });
    expect(w[3].start).toEqual(local(10, 14, 0));
    expect(w[3].end).toEqual(local(10, 20, 0));
    expect(w[2]).toMatchObject({ fun: 20, training: 0, sessions: 1 });
    expect(w[0].start).toEqual(local(9, 23, 0));
    expect(w[0].end).toEqual(local(9, 29, 0));
    expect(w[0]).toMatchObject({ fun: 15, sessions: 1 });
  });

  it("drops weeks before the journal began, but keeps one", () => {
    const w = weeklyExercise([session(local(10, 15, 8), "walk", 30)], NOW);
    expect(w).toHaveLength(1);
    expect(w[0].fun).toBe(30);
    expect(weeklyExercise([], NOW)).toHaveLength(1);
  });

  it("stays on the calendar across the DST change", () => {
    const w = weeklyExercise([session(local(10, 30, 8), "walk", 10), session(local(11, 7, 8), "walk", 5)], local(11, 10, 9));
    expect(w.map((x) => x.end.getDate())).toEqual([20, 27, 3, 10].slice(4 - w.length));
    expect(w[w.length - 1]).toMatchObject({ fun: 5 });
  });
});

describe("the timeline window (TEC-153)", () => {
  // An old event 10 days back: outside the timeline's 5 days, inside the other cards' 14.
  const old = local(10, 10, 9);
  const events = [potty(old, "pee"), meal(old), potty(local(10, 20, 8), "pee"), meal(local(10, 20, 8))];

  it("shows the last 5 local days, today included, in marks and counts alike", () => {
    expect(TIMELINE_DAYS).toBe(5);
    const t = dayTimeline(events, NOW);
    expect(t.marks).toHaveLength(5);
    expect(t.rows).toHaveLength(5);
    expect(t.marks[4].start).toEqual(new Date(2026, 9, 20));
    expect(t.marks[0].start).toEqual(new Date(2026, 9, 16));
    expect(t.rows.map((r) => r.start)).toEqual(t.marks.map((m) => m.start));
    expect(t.marks.flatMap((m) => m.marks)).toHaveLength(2); // the 10 Oct entries are not plotted
  });

  it("leaves every other aggregation on 14 days", () => {
    expect(perDay(events, NOW)).toHaveLength(14);
    expect(peeGaps(events, NOW)).toHaveLength(14);
    expect(mealToPoop(events, NOW).days).toHaveLength(14);
    expect(foodAgainstWeight(events, NOW, "lb").days).toHaveLength(14);
    expect(perDay(events, NOW).reduce((a, r) => a + r.pee, 0)).toBe(2); // the 10 Oct pee is counted
  });

  it("is 5 calendar days across the DST change", () => {
    const now = new Date(2026, 10, 3, 15); // 3 Nov; clocks fell back on 1 Nov
    expect(dayTimeline([], now).marks.map((m) => m.start.getDate())).toEqual([30, 31, 1, 2, 3]);
  });
});
