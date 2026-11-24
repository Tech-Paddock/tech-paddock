import type { CalendarWeekEvent } from "./calendar-client";
import { diffDays, weekdayOf } from "./days";
import type { Chore, Completion } from "./types";

/**
 * What a day holds, worked out from the data and nothing else: the chores due
 * and who ticked them, and the events falling on it. Pure, so it is tested
 * without a browser.
 */

/** The Outlook calendar Pit Row writes its own chores to; its events are left out of the board, or every chore would show twice. */
export const OWN_CALENDAR = "Pit Row";

/** Is the chore due on `day`, by its cadence and start? */
export function isDue(chore: Pick<Chore, "cadence" | "weekdays" | "every_n" | "start_on">, day: string): boolean {
  if (day < chore.start_on) return false;
  switch (chore.cadence) {
    case "once":
      return day === chore.start_on;
    case "daily":
      return true;
    case "weekly":
      return (chore.weekdays ?? []).includes(weekdayOf(day));
    case "every_n":
      return chore.every_n != null && chore.every_n >= 2 && diffDays(chore.start_on, day) % chore.every_n === 0;
  }
}

export type DueChore = {
  chore: Chore;
  /** A once-only chore whose day has passed undone, carried onto today. */
  overdue: boolean;
  /** The live ticks that count for this day. */
  ticks: Completion[];
};

/** The ticks that count for `chore` on `day`: a once-only chore is done whenever it was ticked, any other on its own day. */
function ticksFor(chore: Chore, day: string, completions: Completion[]): Completion[] {
  return completions.filter((c) => c.chore_id === chore.id && (chore.cadence === "once" || c.day === day));
}

/** The chores due on `day`, plus (on `today` only) once-only chores that slipped past undone. */
export function choresForDay(chores: Chore[], completions: Completion[], day: string, today: string): DueChore[] {
  const out: DueChore[] = [];
  for (const chore of chores) {
    const ticks = ticksFor(chore, day, completions);
    if (isDue(chore, day)) out.push({ chore, overdue: false, ticks });
    else if (day === today && chore.cadence === "once" && chore.start_on < today && ticks.length === 0) {
      out.push({ chore, overdue: true, ticks });
    }
  }
  return out;
}

/** The events on `day`: all-day first, then by start. A timed event belongs to the day it starts. */
export function eventsForDay(events: CalendarWeekEvent[], day: string): CalendarWeekEvent[] {
  return events
    .filter((e) => e.calendar !== OWN_CALENDAR)
    .filter((e) => (e.all_day ? e.start <= day && day <= e.end : e.start.slice(0, 10) === day))
    .sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

/** "9:30 am" or "9 am", from a wall-clock "YYYY-MM-DDTHH:mm". No time zone is applied: the string is already Denver's. */
export function clock(stamp: string): string {
  const [h, m] = stamp.slice(11, 16).split(":").map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m === 0 ? "" : `:${String(m).padStart(2, "0")}`} ${h < 12 ? "am" : "pm"}`;
}

/** A device clock time as "9:30 am". */
export function timeOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return clock(`0000-00-00T${p(d.getHours())}:${p(d.getMinutes())}`);
}

/** When an event runs on `day`: "All day", "9:30 am – 10:30 am", or "9:30 am" when it runs past the day. */
export function whenLabel(e: CalendarWeekEvent, day: string): string {
  if (e.all_day) return e.start === e.end ? "All day" : "All day, multi-day";
  if (e.end.slice(0, 10) === day && e.end > e.start) return `${clock(e.start)} – ${clock(e.end)}`;
  return clock(e.start);
}

/** How a cadence reads in the chore list. */
export function cadenceLabel(c: Pick<Chore, "cadence" | "weekdays" | "every_n">): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  switch (c.cadence) {
    case "once":
      return "Once";
    case "daily":
      return "Every day";
    case "weekly":
      return (c.weekdays ?? []).map((d) => names[d]).join(", ");
    case "every_n":
      return `Every ${c.every_n} days`;
  }
}
