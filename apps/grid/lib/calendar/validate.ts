import type { CalendarRecurrence } from "../calendar-client";
import { isDay } from "../days";
import { Invalid } from "../validate";

/**
 * What `POST /api/calendar/events` may say (the contract is in RULES.md,
 * "Calendar contract"). Like every parser here, a message never repeats what was
 * sent: a title can be a person's own words.
 *
 * Times are Denver wall-clock. A timed event is "YYYY-MM-DDTHH:mm" (seconds
 * optional); an all-day event is "YYYY-MM-DD" with `all_day: true`, and its `end`
 * is the last day, inclusive. An offset or a "Z" is refused rather than guessed.
 */
export const APP = /^[a-z][a-z0-9-]{0,30}$/;
export const TITLE_MAX = 200;
export const NOTES_MAX = 4000;
export const SOURCE_ID_MAX = 200;
export const DEFAULT_MINUTES = 60;
export const INTERVAL_MAX = 99;

export const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** A validated upsert: every field in its final shape, so the mapping to Graph has nothing left to decide. */
export type Upsert = {
  op: "upsert";
  app: string;
  source_id: string;
  title: string;
  all_day: boolean;
  /** "YYYY-MM-DD" when all_day, else "YYYY-MM-DDTHH:mm:ss". */
  start: string;
  /** Same shape as start; for all-day it is the last day, inclusive. */
  end: string;
  recurrence: { freq: CalendarRecurrence["freq"]; interval: number; days_of_week?: Weekday[]; until?: string } | null;
  notes: string | null;
};
export type Delete = { op: "delete"; app: string; source_id: string };
export type Parsed = Upsert | Delete;

const TIMED = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function obj(b: unknown): Record<string, unknown> {
  if (typeof b !== "object" || b === null || Array.isArray(b)) throw new Invalid("Expected an object");
  return b as Record<string, unknown>;
}

function text(v: unknown, what: string, max: number, required: boolean): string | null {
  if (v == null || v === "") {
    if (required) throw new Invalid(`${what} is required`);
    return null;
  }
  if (typeof v !== "string") throw new Invalid(`${what} must be text`);
  const s = v.trim();
  if (required && !s) throw new Invalid(`${what} is empty`);
  if (s.length > max) throw new Invalid(`${what} is over ${max} characters`);
  return s || null;
}

/** A timed start or end, as normalised "YYYY-MM-DDTHH:mm:ss", or null when it is not one. */
function timed(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = TIMED.exec(v);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0)];
  if (!isDay(`${m[1]}-${m[2]}-${m[3]}`) || h > 23 || mi > 59 || s > 59) return null;
  return `${y.toString().padStart(4, "0")}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${(m[6] ?? "00").padStart(2, "0")}`;
}

/** "YYYY-MM-DDTHH:mm:ss" plus minutes, in wall-clock terms (no zone, so no DST arithmetic is wanted here). */
export function addMinutes(wall: string, minutes: number): string {
  const d = new Date(`${wall}Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().slice(0, 19);
}

function parseRecurrence(v: unknown, start: string): Upsert["recurrence"] {
  if (v == null) return null;
  const r = obj(v);
  const freq = r.freq;
  if (freq !== "daily" && freq !== "weekly" && freq !== "monthly" && freq !== "yearly") throw new Invalid("recurrence.freq must be daily, weekly, monthly or yearly");
  let interval = 1;
  if (r.interval != null) {
    if (typeof r.interval !== "number" || !Number.isInteger(r.interval) || r.interval < 1 || r.interval > INTERVAL_MAX) {
      throw new Invalid(`recurrence.interval must be a whole number from 1 to ${INTERVAL_MAX}`);
    }
    interval = r.interval;
  }
  let days_of_week: Weekday[] | undefined;
  if (r.days_of_week != null) {
    if (freq !== "weekly") throw new Invalid("recurrence.days_of_week is for weekly repeats");
    if (!Array.isArray(r.days_of_week) || r.days_of_week.length < 1 || r.days_of_week.length > 7) throw new Invalid("recurrence.days_of_week must list 1 to 7 days");
    const seen = new Set<Weekday>();
    for (const d of r.days_of_week) {
      if (typeof d !== "string" || !(WEEKDAYS as readonly string[]).includes(d.toLowerCase())) throw new Invalid("recurrence.days_of_week names a day from sunday to saturday");
      seen.add(d.toLowerCase() as Weekday);
    }
    days_of_week = WEEKDAYS.filter((d) => seen.has(d));
  }
  let until: string | undefined;
  if (r.until != null) {
    if (!isDay(r.until)) throw new Invalid("recurrence.until must be a day as YYYY-MM-DD");
    if (r.until < start.slice(0, 10)) throw new Invalid("recurrence.until is before the start");
    until = r.until;
  }
  return { freq, interval, ...(days_of_week ? { days_of_week } : {}), ...(until ? { until } : {}) };
}

export function parseCalendarEvent(body: unknown): Parsed {
  const b = obj(body);
  if (typeof b.app !== "string" || !APP.test(b.app)) throw new Invalid("app must be lowercase letters, digits and hyphens, starting with a letter");
  const source_id = text(b.source_id, "source_id", SOURCE_ID_MAX, true)!;
  if (b.op === "delete") return { op: "delete", app: b.app, source_id };
  if (b.op !== "upsert") throw new Invalid("op must be upsert or delete");

  const title = text(b.title, "title", TITLE_MAX, true)!;
  const notes = text(b.notes, "notes", NOTES_MAX, false);
  if (b.all_day != null && typeof b.all_day !== "boolean") throw new Invalid("all_day must be true or false");
  const all_day = b.all_day === true;

  let start: string;
  let end: string;
  if (all_day) {
    if (!isDay(b.start)) throw new Invalid("start must be a day as YYYY-MM-DD for an all-day event");
    if (b.end != null && !isDay(b.end)) throw new Invalid("end must be a day as YYYY-MM-DD for an all-day event");
    start = b.start;
    end = (b.end as string | undefined) ?? start;
    if (end < start) throw new Invalid("end is before start");
  } else {
    const s = timed(b.start);
    if (!s) throw new Invalid("start must be a Denver time as YYYY-MM-DDTHH:mm, with no offset");
    if (b.end != null && !timed(b.end)) throw new Invalid("end must be a Denver time as YYYY-MM-DDTHH:mm, with no offset");
    start = s;
    end = b.end != null ? timed(b.end)! : addMinutes(s, DEFAULT_MINUTES);
    if (end <= start) throw new Invalid("end is not after start");
  }
  return { op: "upsert", app: b.app, source_id, title, all_day, start, end, recurrence: parseRecurrence(b.recurrence, start), notes };
}
