/**
 * Analytics over the last `ANALYTICS_DAYS` days, in the phone's local days.
 * Pure, so the day boundaries are tested (tests/analytics.test.ts).
 *
 * A day is local midnight to local midnight, built with the calendar
 * (`new Date(y, m, d - i)`), never by subtracting 24 h: a DST change makes one
 * day 23 or 25 hours long, and subtracting would put an evening on the wrong day.
 */

import {
  exercise,
  food,
  fromKg,
  growthPoints,
  liveEvents,
  potty,
  round1,
  type JournalEvent,
  type PottyWhat,
  type Unit,
} from "./events";

export const ANALYTICS_DAYS = 14;
/** The Day by day timeline alone looks back this many local days, today included (TEC-153). */
export const TIMELINE_DAYS = 5;

export type DayRow = {
  /** Local midnight that starts the day. */
  start: Date;
  pee: number;
  poop: number;
  accident: number;
  meal: number;
  treat: number;
  walk: number;
  playtime: number;
  training: number;
  /** Total exercise minutes. */
  minutes: number;
};

export type Count = Exclude<keyof DayRow, "start">;

/** Local midnights, oldest first; the last is today's. */
export function dayStarts(now: Date, days = ANALYTICS_DAYS): Date[] {
  return Array.from(
    { length: days },
    (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i))
  );
}

const empty = (start: Date): DayRow => ({
  start,
  pee: 0,
  poop: 0,
  accident: 0,
  meal: 0,
  treat: 0,
  walk: 0,
  playtime: 0,
  training: 0,
  minutes: 0,
});

/**
 * One row per local day, live events only (a corrected entry counts once, as
 * its correction; a deleted one not at all).
 *
 * Potty: inside is an accident and counts only as one; outside counts a pee, a
 * poop, or one of each for both. A No potty counts as nothing, inside or out.
 */
export function perDay(events: JournalEvent[], now: Date, days = ANALYTICS_DAYS): DayRow[] {
  const starts = dayStarts(now, days);
  const rows = starts.map(empty);
  const first = starts[0].getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();

  for (const e of liveEvents(events)) {
    const t = Date.parse(e.at);
    if (t < first || t >= end) continue;
    let i = rows.length - 1;
    while (i > 0 && starts[i].getTime() > t) i--;
    const row = rows[i];
    switch (e.kind) {
      case "potty": {
        const p = potty(e);
        if (p.what === "none") break;
        if (p.where === "inside") row.accident++;
        else {
          if (p.what !== "poop") row.pee++;
          if (p.what !== "pee") row.poop++;
        }
        break;
      }
      case "food":
        row[food(e).type === "treat" ? "treat" : "meal"]++;
        break;
      case "exercise": {
        const x = exercise(e);
        row[x.type]++;
        row.minutes += x.minutes;
        break;
      }
    }
  }
  return rows;
}

const ALL: Count[] = ["pee", "poop", "accident", "meal", "treat", "walk", "playtime", "training"];
const sum = (rows: DayRow[], keys: Count[]) => rows.reduce((s, r) => s + keys.reduce((a, k) => a + r[k], 0), 0);

/**
 * The average per day of `keys`, over complete days only (today is still
 * going) and from the first day anything was logged (days before the journal
 * began are not zeros). Null when there is no complete day to average.
 */
export function dailyAverage(rows: DayRow[], keys: Count[]): number | null {
  const done = rows.slice(0, -1);
  const from = done.findIndex((r) => sum([r], ALL) > 0);
  if (from < 0) return null;
  const span = done.slice(from);
  return sum(span, keys) / span.length;
}

/** One line on accidents: the recent half of the days against the half before it. */
export function accidentTrend(rows: DayRow[]): string {
  const half = Math.floor(rows.length / 2);
  const before = sum(rows.slice(rows.length - 2 * half, rows.length - half), ["accident"]);
  const recent = sum(rows.slice(rows.length - half), ["accident"]);
  const n = (k: number) => `${k} ${k === 1 ? "accident" : "accidents"}`;
  if (before === 0 && recent === 0) return `No accidents in ${rows.length} days.`;
  if (recent < before) return `${n(recent)} in the last ${half} days, down from ${before} the ${half} before.`;
  if (recent > before) return `${n(recent)} in the last ${half} days, up from ${before} the ${half} before.`;
  return `${n(recent)} in the last ${half} days, the same as the ${half} before.`;
}

/** "About 6.4" or "—": one decimal, never a false precision. */
export function about(n: number | null): string {
  return n === null ? "—" : (Math.round(n * 10) / 10).toString();
}

/* ── The day timeline (TEC-143) ──────────────────────────────────────────── */

export type MarkKind = "pee" | "poop" | "accident" | "meal" | "treat";
export const MARK_KINDS: MarkKind[] = ["pee", "poop", "accident", "meal", "treat"];
export const MARK_LABELS: Record<MarkKind, string> = {
  pee: "Pee",
  poop: "Poop",
  accident: "Accident",
  meal: "Meal",
  treat: "Treat",
};
/** Potty marks ride the top lane of a timeline row, food marks the bottom one. */
export const markLane = (k: MarkKind): "potty" | "food" => (k === "meal" || k === "treat" ? "food" : "potty");

export type Mark = {
  kind: MarkKind;
  /** Epoch ms. */
  at: number;
  /** Wall-clock hours since the day's local midnight, 0 up to (not including) 24. */
  hour: number;
  /** An accident's what (pee, poop or both); undefined for the rest. */
  what?: PottyWhat;
};

export type DayMarks = { start: Date; marks: Mark[] };

const KIND_ORDER = Object.fromEntries(MARK_KINDS.map((k, i) => [k, i])) as Record<MarkKind, number>;

/** Index of the local day holding `t`; -1 before the first. */
function dayIndex(starts: Date[], t: number): number {
  let i = starts.length - 1;
  while (i > 0 && starts[i].getTime() > t) i--;
  return starts[i].getTime() > t ? -1 : i;
}

/** Midnight that ends today (the exclusive upper bound of the last day). */
const endOfToday = (now: Date) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();

/**
 * One list of marks per local day (oldest first, the same days as `perDay`),
 * each in time order. A live pee, poop, accident, meal or treat is one mark;
 * "both" outside is two marks at the same time (a pee and a poop); inside is
 * one accident mark whatever it was, exactly as `perDay` counts it. "No potty"
 * trips, weights, exercise and health are not marks. `hour` is the wall clock,
 * so on a DST day the two 1 a.m. hours share a place: each mark is right to the
 * clock the phone showed.
 */
export function dayMarks(events: JournalEvent[], now: Date, days = ANALYTICS_DAYS): DayMarks[] {
  const starts = dayStarts(now, days);
  const out: DayMarks[] = starts.map((start) => ({ start, marks: [] }));
  const first = starts[0].getTime();
  const end = endOfToday(now);
  for (const e of liveEvents(events)) {
    const t = Date.parse(e.at);
    if (t < first || t >= end) continue;
    const d = new Date(t);
    const hour = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    const marks: Mark[] = [];
    if (e.kind === "potty") {
      const p = potty(e);
      if (p.what === "none") continue;
      if (p.where === "inside") marks.push({ kind: "accident", at: t, hour, what: p.what });
      else {
        if (p.what !== "poop") marks.push({ kind: "pee", at: t, hour });
        if (p.what !== "pee") marks.push({ kind: "poop", at: t, hour });
      }
    } else if (e.kind === "food") {
      marks.push({ kind: food(e).type === "treat" ? "treat" : "meal", at: t, hour });
    } else continue;
    out[dayIndex(starts, t)].marks.push(...marks);
  }
  for (const d of out) d.marks.sort((a, b) => a.at - b.at || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  return out;
}

/** What the Day by day card draws: `TIMELINE_DAYS` days of marks and of counts, the same days, oldest first. */
export function dayTimeline(events: JournalEvent[], now: Date): { marks: DayMarks[]; rows: DayRow[] } {
  return { marks: dayMarks(events, now, TIMELINE_DAYS), rows: perDay(events, now, TIMELINE_DAYS) };
}

/**
 * Stack level (0, 1, 2) per mark so two marks in one lane closer than `gap`
 * hours do not sit on each other: each takes the lowest level whose last mark
 * is at least `gap` away. `hours` is ascending. When all levels are taken the
 * last is reused (a fourth mark within the gap overlaps; the row's tap text
 * lists every time).
 */
export function stackLevels(hours: number[], gap: number, levels = 3): number[] {
  const lastAt: number[] = Array(levels).fill(-Infinity);
  return hours.map((h) => {
    let lvl = lastAt.findIndex((x) => h - x >= gap);
    if (lvl < 0) lvl = levels - 1;
    lastAt[lvl] = h;
    return lvl;
  });
}

/** The mark nearest `hour` within `maxGap` hours, or null. */
export function nearestMark<T extends { hour: number }>(marks: T[], hour: number, maxGap: number): T | null {
  let best: T | null = null;
  for (const m of marks) {
    const d = Math.abs(m.hour - hour);
    if (d <= maxGap && (!best || d < Math.abs(best.hour - hour))) best = m;
  }
  return best;
}

/* ── Potty gaps ──────────────────────────────────────────────────────────── */

export type GapDay = {
  start: Date;
  /** Pees that day (an inside pee counts: the bladder emptied either way). */
  pees: number;
  /** Daytime gaps in ms: both pees on this local day. */
  gaps: number[];
  /** Mean of `gaps`, ms; null with none. */
  average: number | null;
  /** Longest of `gaps`, ms; null with none. */
  longest: number | null;
  /** The gap from the last pee of an earlier day to this day's first, ms; null with no earlier pee. */
  overnight: number | null;
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * Time between pees, per local day.
 *
 * A pee is any live potty whose what is pee or both, outside or inside (an
 * accident is still a pee); a poop alone and "no potty" are not. A gap is the
 * elapsed time between two consecutive pees and is **assigned to the day it
 * ends on**.
 *
 * **Midnight and the night.** A gap whose two pees fall on different local days
 * crosses midnight: it is the overnight gap. It is *not* in `gaps`, `average`
 * or `longest`, so a night's sleep does not swamp the daytime numbers; it is
 * reported on its own, as `overnight`, on the day it ends (that day's first
 * pee). The last pee before the window still anchors the first day's overnight.
 * A day with fewer than two pees has no daytime gap (null, never zero).
 */
export function peeGaps(events: JournalEvent[], now: Date, days = ANALYTICS_DAYS): GapDay[] {
  const starts = dayStarts(now, days);
  const rows: GapDay[] = starts.map((start) => ({ start, pees: 0, gaps: [], average: null, longest: null, overnight: null }));
  const end = endOfToday(now);
  const pees = liveEvents(events)
    .filter((e) => e.kind === "potty" && (potty(e).what === "pee" || potty(e).what === "both"))
    .map((e) => Date.parse(e.at))
    .filter((t) => t < end)
    .sort((a, b) => a - b);
  for (let i = 0; i < pees.length; i++) {
    const idx = dayIndex(starts, pees[i]);
    if (idx < 0) continue;
    rows[idx].pees++;
    if (i === 0) continue;
    const gap = pees[i] - pees[i - 1];
    if (sameDay(new Date(pees[i]), new Date(pees[i - 1]))) rows[idx].gaps.push(gap);
    else rows[idx].overnight = gap;
  }
  for (const r of rows) {
    if (r.gaps.length) {
      r.average = r.gaps.reduce((s, g) => s + g, 0) / r.gaps.length;
      r.longest = Math.max(...r.gaps);
    }
  }
  return rows;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** The window's typical (median) daytime gap and overnight gap, and its longest daytime gap, all ms. */
export function typicalGaps(rows: GapDay[]): { daytime: number | null; overnight: number | null; longest: { start: Date; ms: number } | null } {
  let longest: { start: Date; ms: number } | null = null;
  for (const r of rows) if (r.longest !== null && (!longest || r.longest > longest.ms)) longest = { start: r.start, ms: r.longest };
  return {
    daytime: median(rows.flatMap((r) => r.gaps)),
    overnight: median(rows.flatMap((r) => (r.overnight === null ? [] : [r.overnight]))),
    longest,
  };
}

/** "47m", "2h 5m", "3h": a span in ms, rounded to the minute. */
export function formatSpan(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

/* ── Meal to poop ────────────────────────────────────────────────────────── */

export const MEAL_POOP_WINDOW_MS = 6 * 3_600_000;

export type MealPoopDay = {
  start: Date;
  /** Minutes from each matched meal to its next poop. */
  minutes: number[];
  median: number | null;
  /** Meals with no poop inside the window. */
  none: number;
};

export type MealPoop = {
  days: MealPoopDay[];
  /** Median minutes over every matched meal in the window; null with none. */
  median: number | null;
  matched: number;
  /** Meals with no poop inside the window, left out of the median. */
  none: number;
  /** Meals too recent to judge: no poop yet and the window has not run out. Left out. */
  pending: number;
};

/**
 * For each live meal (a treat is not a meal) on the window's days, the minutes
 * to the next poop after it (what poop or both, outside or inside), counted
 * only when that poop is within `MEAL_POOP_WINDOW_MS` (6 h). A meal with no poop
 * inside the window is left out of every median and counted in `none` — unless
 * the window has not yet run out at `now`, when it is `pending` (the poop may
 * still come). Two meals can share one poop. The poop may fall on the next day;
 * the meal's own day owns the number. `now` is the real clock here, not a
 * midnight.
 */
export function mealToPoop(events: JournalEvent[], now: Date, days = ANALYTICS_DAYS): MealPoop {
  const starts = dayStarts(now, days);
  const rows: MealPoopDay[] = starts.map((start) => ({ start, minutes: [], median: null, none: 0 }));
  const live = liveEvents(events);
  const poops = live
    .filter((e) => e.kind === "potty" && (potty(e).what === "poop" || potty(e).what === "both"))
    .map((e) => Date.parse(e.at))
    .sort((a, b) => a - b);
  const first = starts[0].getTime();
  const end = endOfToday(now);
  let pending = 0;
  for (const e of live) {
    if (e.kind !== "food" || food(e).type !== "meal") continue;
    const t = Date.parse(e.at);
    if (t < first || t >= end) continue;
    const row = rows[dayIndex(starts, t)];
    const next = poops.find((p) => p > t);
    if (next !== undefined && next - t <= MEAL_POOP_WINDOW_MS) row.minutes.push(Math.round((next - t) / 60_000));
    else if (now.getTime() - t < MEAL_POOP_WINDOW_MS) pending++;
    else row.none++;
  }
  for (const r of rows) r.median = median(r.minutes);
  const all = rows.flatMap((r) => r.minutes);
  return { days: rows, median: median(all), matched: all.length, none: rows.reduce((s, r) => s + r.none, 0), pending };
}

/* ── Food against weight ─────────────────────────────────────────────────── */

export type FoodWeightDay = {
  start: Date;
  /** Total meal amount in the chosen unit; 0 with none. */
  amount: number;
  /** Meals counted in `amount`. */
  meals: number;
  /** The day's last weigh-in in `weightUnit`, one decimal; null with none. */
  weight: number | null;
};

export type FoodWeight = {
  days: FoodWeightDay[];
  /** The unit the amounts are summed in; null when it is the unit-less group (Misc) or no meal has an amount. */
  unit: string | null;
  /** Any meal had an amount, so `unit` null means the unit-less group. */
  hasAmounts: boolean;
  /** Meals in another unit, left out of the sums. */
  otherUnit: number;
  /** Meals with no amount, left out of the sums. */
  noAmount: number;
  weightUnit: Unit;
};

/**
 * Total meal amount per day, and the day's weight, over the same days.
 *
 * Amounts only: calories are never shown. Meals are logged in different units
 * (cup, piece, pop; Misc has none), and adding a cup to a piece means nothing,
 * so the **most common unit** among the window's meals that have an amount (a
 * meal with no unit is its own group; a tie goes to the unit that sorts first)
 * is summed, and every meal in another unit is left out and counted in
 * `otherUnit`, which the screen says. A meal with no amount is `noAmount`.
 * Treats are not meals. Weight is converted to `weightUnit` (the newest
 * weight's, as the growth chart does); of two weigh-ins in a day the later wins.
 */
export function foodAgainstWeight(events: JournalEvent[], now: Date, weightUnit: Unit, days = ANALYTICS_DAYS): FoodWeight {
  const starts = dayStarts(now, days);
  const rows: FoodWeightDay[] = starts.map((start) => ({ start, amount: 0, meals: 0, weight: null }));
  const first = starts[0].getTime();
  const end = endOfToday(now);
  const meals = liveEvents(events)
    .filter((e) => e.kind === "food" && food(e).type === "meal")
    .map((e) => ({ t: Date.parse(e.at), unit: food(e).unit ?? "", amount: food(e).amount }))
    .filter((m) => m.t >= first && m.t < end);
  const counts = new Map<string, number>();
  for (const m of meals) if (m.amount !== null) counts.set(m.unit, (counts.get(m.unit) ?? 0) + 1);
  const chosen = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null;
  let otherUnit = 0;
  let noAmount = 0;
  for (const m of meals) {
    if (m.amount === null) noAmount++;
    else if (m.unit !== chosen) otherUnit++;
    else {
      const r = rows[dayIndex(starts, m.t)];
      r.amount += m.amount;
      r.meals++;
    }
  }
  for (const p of growthPoints(events)) {
    const t = Date.parse(p.at);
    if (t < first || t >= end) continue;
    rows[dayIndex(starts, t)].weight = round1(fromKg(p.kg, weightUnit)); // oldest first, so the last of a day wins
  }
  return { days: rows, unit: chosen || null, hasAmounts: chosen !== null, otherUnit, noAmount, weightUnit };
}

/* ── Exercise per week ───────────────────────────────────────────────────── */

export const EXERCISE_WEEKS = 4;

export type WeekRow = {
  /** The week's first and last local day. */
  start: Date;
  end: Date;
  /** Minutes of walks and playtime (Fun). */
  fun: number;
  /** Minutes of training. */
  training: number;
  sessions: number;
};

/**
 * Exercise minutes in rolling seven-day weeks that end today (the newest is
 * "the last 7 days"), oldest first, built with the calendar. Four weeks is 28
 * days, inside the journal's 30-day read. Leading weeks that end before the
 * journal's first entry (any kind but weight) are dropped, so a young journal
 * does not show empty weeks as if they were quiet ones.
 */
export function weeklyExercise(events: JournalEvent[], now: Date, weeks = EXERCISE_WEEKS): WeekRow[] {
  const starts = dayStarts(now, weeks * 7);
  const live = liveEvents(events);
  const rows: WeekRow[] = Array.from({ length: weeks }, (_, w) => ({
    start: starts[w * 7],
    end: starts[w * 7 + 6],
    fun: 0,
    training: 0,
    sessions: 0,
  }));
  const first = starts[0].getTime();
  const end = endOfToday(now);
  for (const e of live) {
    if (e.kind !== "exercise") continue;
    const t = Date.parse(e.at);
    if (t < first || t >= end) continue;
    const row = rows[Math.floor(dayIndex(starts, t) / 7)];
    const x = exercise(e);
    row[x.type === "training" ? "training" : "fun"] += x.minutes;
    row.sessions++;
  }
  const began = live.filter((e) => e.kind !== "weight").reduce((m, e) => Math.min(m, Date.parse(e.at)), Infinity);
  const keep = rows.findIndex((r) => new Date(r.end.getFullYear(), r.end.getMonth(), r.end.getDate() + 1).getTime() > began);
  return keep < 0 ? rows.slice(-1) : rows.slice(keep);
}
