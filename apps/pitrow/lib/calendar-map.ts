import { addDays, weekdayOf } from "./days";
import { sendCalendarEvent, type CalendarEvent } from "./calendar-client";
import type { Cadence } from "./types";

/**
 * Pit Row as a caller of the household calendar (contract in apps/grid/RULES.md,
 * "Calendar contract"). It sends through the stamped `sendCalendarEvent`, never
 * the calendar module directly, so nothing here changes when the route moves.
 *
 * - **`source_id` is the chore's own id**, so a resend updates the same event.
 * - **Every chore is an all-day event** on its first due day, repeating as its
 *   cadence does; retiring a chore deletes its event.
 * - **Titles stay plain**: the title is the chore's and nothing else. Nobody's
 *   name goes to a calendar others see.
 * - **It never throws and never fails a save**: a calendar that is down only
 *   means the event waits for the next send.
 */
export const APP = "pit-row";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

type Sender = (event: CalendarEvent) => Promise<{ ok: boolean }>;
type HasHeaders = { headers: { get(name: string): string | null } };

type ChoreForCalendar = { id: string; title: string; cadence: Cadence; weekdays: number[] | null; every_n: number | null; start_on: string };

export function choreEvent(c: ChoreForCalendar): CalendarEvent {
  const base = { app: APP, source_id: c.id, op: "upsert" as const, title: c.title, all_day: true };
  switch (c.cadence) {
    case "once":
      return { ...base, start: c.start_on };
    case "daily":
      return { ...base, start: c.start_on, recurrence: { freq: "daily" } };
    case "every_n":
      return { ...base, start: c.start_on, recurrence: { freq: "daily", interval: c.every_n ?? 2 } };
    case "weekly": {
      const days = [...(c.weekdays ?? [])].sort((a, b) => a - b);
      // The series starts on the first of its own weekdays on or after `start_on`.
      let start = c.start_on;
      for (let i = 0; i < 7 && !days.includes(weekdayOf(start)); i++) start = addDays(start, 1);
      return { ...base, start, recurrence: { freq: "weekly", days_of_week: days.map((d) => DAY_NAMES[d]) } };
    }
  }
}

export function choreGone(id: string): CalendarEvent {
  return { app: APP, source_id: id, op: "delete" };
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
