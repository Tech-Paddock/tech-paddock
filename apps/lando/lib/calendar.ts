/**
 * The Calendar tab's rules (TEC-234), with no I/O so every one is tested. It reads what the screen already
 * holds: the live journal entries (`lando.events`, notes already taken out) and the open plans
 * (`lando.upcoming`). It adds no table and writes nothing.
 *
 * Days are `YYYY-MM-DD` strings in the phone's calendar, as everywhere else, so no time zone moves one.
 * A month is a grid of whole weeks starting Sunday. A day wears small dots: a filled dot for each kind of
 * entry logged that day and a ring for each kind of plan due that day, coloured as the feed is.
 */
import { FORM_KINDS, feedTone, formOf, liveEvents, newestFirst, type FeedTone, type JournalEvent } from "./events";
import { formForItem } from "./future";
import { toDateInput } from "./localtime";
import { isDay, openItems, parseDay, type Upcoming } from "./upcoming";

const pad = (n: number) => String(n).padStart(2, "0");

/** A month as year and month 1-12. */
export type YearMonth = { year: number; month: number };

export const monthOf = (day: string): YearMonth => {
  const p = parseDay(day);
  return p ? { year: p[0], month: p[1] } : { year: 1970, month: 1 };
};

/** The month `delta` months from `ym`, across year ends. */
export function shiftMonth(ym: YearMonth, delta: number): YearMonth {
  const index = ym.year * 12 + (ym.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export const monthKey = (ym: YearMonth) => `${ym.year}-${pad(ym.month)}`;

/** "November 2026", built from the parts. */
export function monthLabel(ym: YearMonth): string {
  return new Date(ym.year, ym.month - 1, 1).toLocaleDateString([], { month: "long", year: "numeric" });
}

/** One cell of the grid. `inMonth` is false for the leading and trailing days of the neighbouring months. */
export type Cell = { day: string; date: number; inMonth: boolean };

/** The month as whole weeks, Sunday first: four to six rows of seven. */
export function monthGrid(ym: YearMonth): Cell[][] {
  const first = new Date(ym.year, ym.month - 1, 1);
  const length = new Date(ym.year, ym.month, 0).getDate();
  const lead = first.getDay();
  const total = Math.ceil((lead + length) / 7) * 7;
  const weeks: Cell[][] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(ym.year, ym.month - 1, 1 - lead + i);
    const cell: Cell = {
      day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      date: d.getDate(),
      inMonth: d.getMonth() === ym.month - 1,
    };
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(cell);
  }
  return weeks;
}

/** What a day holds: its open plans (soonest time first) and its live entries (newest first). */
export type DayBucket = { plans: Upcoming[]; entries: JournalEvent[] };

/** A plan's time as a sort key; a plan with no time sorts first. */
const planKey = (i: Upcoming) => i.due_time ?? "";

/**
 * Every day that holds something. Notes are not here, as they are not in the Log feed (RULES): a note, or a
 * void, never lands on a day even if the caller hands one in. A voided entry (corrected or deleted) is gone.
 * Plans are the open ones only; a done or cancelled plan is history the plans list never loaded.
 */
export function calendarDays(entries: readonly JournalEvent[], plans: readonly Upcoming[]): Map<string, DayBucket> {
  const days = new Map<string, DayBucket>();
  const bucket = (day: string) => {
    let b = days.get(day);
    if (!b) days.set(day, (b = { plans: [], entries: [] }));
    return b;
  };
  for (const e of liveEvents(entries.filter((x) => x.kind !== "note").slice()).sort(newestFirst)) {
    if (formOf(e) === null) continue;
    bucket(toDateInput(e.at)).entries.push(e);
  }
  for (const p of openItems(plans)) {
    if (isDay(p.due_on)) bucket(p.due_on).plans.push(p);
  }
  for (const b of days.values()) b.plans.sort((a, c) => planKey(a).localeCompare(planKey(c)));
  return days;
}

/** The colour a plan wears: its form's (a vet visit, vaccine and medication are Health), or none for an old plan with its own words. */
export function planTone(item: Pick<Upcoming, "kind" | "title">): FeedTone | null {
  return formForItem(item)?.form ?? null;
}

/** Dots shown at most per style on a day; the rest are in the day's list. */
export const MAX_DOTS = 3;

/** Distinct tones in the feed's order (accident last), so a day's dots do not shuffle. */
const ORDER: readonly FeedTone[] = [...FORM_KINDS, "accident"];
const byOrder = (a: FeedTone | null, b: FeedTone | null) =>
  (a === null ? ORDER.length : ORDER.indexOf(a)) - (b === null ? ORDER.length : ORDER.indexOf(b));

export type Dots = { entries: FeedTone[]; plans: (FeedTone | null)[] };

/** The dots under a day's number: one filled dot per kind of entry, one ring per kind of plan, each style capped. */
export function dayDots(b: DayBucket | undefined): Dots {
  if (!b) return { entries: [], plans: [] };
  const entries = [...new Set(b.entries.map((e) => feedTone(e)).filter((t): t is FeedTone => t !== null))].sort(byOrder);
  const plans = [...new Set(b.plans.map(planTone))].sort(byOrder);
  return { entries: entries.slice(0, MAX_DOTS), plans: plans.slice(0, MAX_DOTS) };
}

/** A day's words for a screen reader: "Nov 8: 2 plans, 3 entries". */
export function dayWords(day: string, b: DayBucket | undefined): string {
  const p = parseDay(day);
  const label = p ? new Date(p[0], p[1] - 1, p[2]).toLocaleDateString([], { month: "short", day: "numeric" }) : day;
  const plans = b?.plans.length ?? 0;
  const entries = b?.entries.length ?? 0;
  const parts = [
    plans ? `${plans} ${plans === 1 ? "plan" : "plans"}` : "",
    entries ? `${entries} ${entries === 1 ? "entry" : "entries"}` : "",
  ].filter(Boolean);
  return parts.length ? `${label}: ${parts.join(", ")}` : `${label}: nothing`;
}

/** The heading over a chosen day's list: "Today, Nov 8", "Sunday, Nov 15". */
export function dayHeading(day: string, today: string): string {
  const p = parseDay(day);
  if (!p) return day;
  const d = new Date(p[0], p[1] - 1, p[2]);
  const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
  return day === today ? `Today, ${date}` : `${d.toLocaleDateString([], { weekday: "long" })}, ${date}`;
}

/**
 * The When a new plan opens on for a chosen day: nine in the morning for a later day, and for today the next
 * whole hour (at most 23:59), so the form reads Future and saves a plan, not an entry. `now` is the phone's clock.
 */
export function plannedWhen(day: string, now: Date): string {
  const today = toDateInput(now.toISOString());
  if (day === today) {
    const h = now.getHours() + 1;
    return `${day}T${h > 23 ? "23:59" : `${pad(h)}:00`}`;
  }
  return `${day}T09:00`;
}

/** A plan can be added on today and later days; an earlier day is only looked at. */
export const canPlanOn = (day: string, today: string) => isDay(day) && day >= today;

/** A swipe this far across, and mostly sideways, steps a month; anything else is a scroll or a tap. */
export const SWIPE_MIN_PX = 50;

/** -1 for a swipe right (the month before), 1 for a swipe left (the next), 0 for neither. */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}
