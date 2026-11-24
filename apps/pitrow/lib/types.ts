import type { CalendarWeekResult } from "./calendar-client";

/** What `GET /api/week` returns: one week in one read. */
export type Cadence = "once" | "daily" | "weekly" | "every_n";

export type Person = { id: string; name: string; active: boolean };

export type Chore = {
  id: string;
  title: string;
  cadence: Cadence;
  /** 0 (Sunday) to 6, for `weekly`; otherwise null. */
  weekdays: number[] | null;
  /** For `every_n`; otherwise null. */
  every_n: number | null;
  /** The day it first falls due, and what `every_n` counts from. */
  start_on: string;
  assignee_id: string | null;
};

/** One live tick: who did which chore, for which day. A voided tick is not here. */
export type Completion = { id: string; chore_id: string; day: string; person_id: string };

export type WeekData = {
  start: string;
  people: Person[];
  chores: Chore[];
  /** The week's ticks, plus every tick of a once-only chore (it carries forward until done). */
  completions: Completion[];
  /** The read of Outlook, kept apart so a failed read is a failure and never an empty week. */
  events: CalendarWeekResult;
};
