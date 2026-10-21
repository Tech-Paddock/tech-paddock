/**
 * Analytics over the last `ANALYTICS_DAYS` days, in the phone's local days.
 * Pure, so the day boundaries are tested (tests/analytics.test.ts).
 *
 * A day is local midnight to local midnight, built with the calendar
 * (`new Date(y, m, d - i)`), never by subtracting 24 h: a DST change makes one
 * day 23 or 25 hours long, and subtracting would put an evening on the wrong day.
 */

import { exercise, food, liveEvents, potty, type JournalEvent } from "./events";

export const ANALYTICS_DAYS = 14;

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
 * poop, or one of each for both.
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

/** One line on accidents: this week against the week before. */
export function accidentTrend(rows: DayRow[]): string {
  const half = Math.floor(rows.length / 2);
  const before = sum(rows.slice(0, rows.length - half), ["accident"]);
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
