import { addDays, weekdayOf } from "./days";
import { sendCalendarEvent, type CalendarEvent } from "./calendar-client";

/**
 * Grid as a caller of the household calendar (#68; contract in RULES.md,
 * "Calendar contract"). Grid sends through the stamped `sendCalendarEvent`, never
 * the calendar module directly, so nothing here changes when the route moves.
 *
 * - **`source_id` is the row's own id**, so a resend updates the same event.
 * - **Routines** are all-day events repeating weekly on their weekdays (they
 *   have no time of day yet); retiring one deletes its event.
 * - **Tasks with a due date** are all-day events on that day; a task ticked
 *   done, or with its date cleared, has its event deleted.
 * - **It never throws and never fails a save**: a calendar that is down only
 *   means the event waits for the next send or the backfill.
 */
export const APP = "grid";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

type Sender = (event: CalendarEvent) => Promise<{ ok: boolean }>;
type HasHeaders = { headers: { get(name: string): string | null } };

/** The Denver calendar day now. A routine's repeat starts here: Grid has no earlier date to give it. */
export function denverToday(now: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function routineEvent(r: { id: string; name: string; weekdays: number[] }, today: string = denverToday()): CalendarEvent {
  // The first day on or after today that the routine runs, so the series starts on one of its own weekdays.
  let start = today;
  for (let i = 0; i < 7 && !r.weekdays.includes(weekdayOf(start)); i++) start = addDays(start, 1);
  return {
    app: APP,
    source_id: r.id,
    op: "upsert",
    title: r.name,
    start,
    all_day: true,
    recurrence: { freq: "weekly", days_of_week: [...r.weekdays].sort((a, b) => a - b).map((d) => DAY_NAMES[d]) },
  };
}

export function routineGone(id: string): CalendarEvent {
  return { app: APP, source_id: id, op: "delete" };
}

/** A task's event: on its due day while it is open and dated, otherwise none (a delete). */
export function taskEvent(t: { id: string; title: string; due_on: string | null; done_on: string | null }): CalendarEvent {
  if (!t.due_on || t.done_on) return { app: APP, source_id: t.id, op: "delete" };
  return { app: APP, source_id: t.id, op: "upsert", title: t.title, start: t.due_on, all_day: true };
}

export function senderFor(request: HasHeaders): Sender {
  return (event) => sendCalendarEvent(request, event);
}

/** Sends one event, swallowing anything: the save that caused it has already succeeded. */
export async function sendQuietly(send: Sender, event: CalendarEvent | null): Promise<boolean> {
  if (!event) return false;
  try {
    return (await send(event)).ok;
  } catch {
    return false;
  }
}
