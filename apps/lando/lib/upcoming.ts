import { InvalidEvent } from "./events";

/**
 * Upcoming (TEC-192): vet visits, vaccines, medications and other plans, kept in `lando.upcoming`.
 * An item is a plan, not a journal entry: it is edited in place and cancelled, never deleted, and the
 * journal (`lando.events`) is never touched. Everything here is pure; the database half is
 * `upcoming-db.ts`. Days are `YYYY-MM-DD` strings in the phone's calendar, never instants, so no time
 * zone can move one.
 */

export const UPCOMING_KINDS = ["vet", "vaccine", "medication", "other"] as const;
export type UpcomingKind = (typeof UPCOMING_KINDS)[number];
export const UPCOMING_LABELS: Record<UpcomingKind, string> = {
  vet: "Vet visit",
  vaccine: "Vaccine",
  medication: "Medication",
  other: "Other",
};

export const REPEAT_UNITS = ["week", "month", "year"] as const;
export type RepeatUnit = (typeof REPEAT_UNITS)[number];

export const UPCOMING_STATUSES = ["open", "done", "cancelled"] as const;
export type UpcomingStatus = (typeof UPCOMING_STATUSES)[number];

/** A row of `lando.upcoming` as the screen holds it (`due_time` is `HH:MM`). */
export type Upcoming = {
  id: string;
  kind: UpcomingKind;
  title: string;
  due_on: string;
  due_time: string | null;
  note: string | null;
  repeat_every: number | null;
  repeat_unit: RepeatUnit | null;
  status: UpcomingStatus;
  done_on: string | null;
  done_event: string | null;
  created_at: string;
  updated_at: string;
};

/** What a form sends to add or edit an item. */
export type UpcomingInput = {
  kind: UpcomingKind;
  title: string;
  due_on: string;
  due_time: string | null;
  note: string | null;
  repeat_every: number | null;
  repeat_unit: RepeatUnit | null;
};

export const TITLE_MAX = 80;
export const NOTE_MAX = 500;
export const REPEAT_MAX = 99;
/** An item due within this many days (or today) is amber. */
export const SOON_DAYS = 7;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/* ── Days ────────────────────────────────────────────────────────────────── */

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD` as [year, month 1-12, day], or null when it is not a real calendar day. */
export function parseDay(value: unknown): [number, number, number] | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? [y, mo, d] : null;
}

export const isDay = (v: unknown): v is string => parseDay(v) !== null;

const fmt = (y: number, mo: number, d: number) => `${String(y).padStart(4, "0")}-${pad(mo)}-${pad(d)}`;
const daysInMonth = (y: number, mo: number) => new Date(Date.UTC(y, mo, 0)).getUTCDate();

/** Whole days from `from` to `to` (negative when `to` is earlier). Both are valid days. */
export function daysBetween(from: string, to: string): number {
  const a = parseDay(from)!;
  const b = parseDay(to)!;
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000);
}

/**
 * The next due date of a repeating item: `due` plus `every` weeks, months or years. A month or year
 * that has no such day lands on the last day of the target month (Jan 31 + 1 month = Feb 28, or Feb 29
 * in a leap year; Feb 29 + 1 year = Feb 28).
 */
export function nextDue(due: string, every: number, unit: RepeatUnit): string {
  const [y, mo, d] = parseDay(due)!;
  if (unit === "week") {
    const t = new Date(Date.UTC(y, mo - 1, d + 7 * every));
    return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  const months = unit === "month" ? every : 12 * every;
  const index = y * 12 + (mo - 1) + months;
  const ty = Math.floor(index / 12);
  const tm = (index % 12) + 1;
  return fmt(ty, tm, Math.min(d, daysInMonth(ty, tm)));
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "Thu Nov 6": the day's weekday and date, from its parts so no time zone can shift it. */
export function dayText(day: string): string {
  const [y, mo, d] = parseDay(day)!;
  return `${WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]} ${MONTHS[mo - 1]} ${d}`;
}

/** "9:30 AM" from `HH:MM`. */
export function timeText(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}

/* ── Order and colour ────────────────────────────────────────────────────── */

/** Open items, soonest first: by day, then time (an item with no time after one with a time), then when added. */
export function openItems(items: readonly Upcoming[]): Upcoming[] {
  return items
    .filter((i) => i.status === "open")
    .sort(
      (a, b) =>
        a.due_on.localeCompare(b.due_on) ||
        (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99") ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id)
    );
}

/** The pills' status names (`data-status`): amber is "yellow", overdue is "red"; the rest is neutral (null). */
export type UpcomingTone = "yellow" | "red" | null;

export const UPCOMING_TONE_WORDS = { yellow: "amber, due soon", red: "red, overdue" } as const;

/** Overdue is red; due today or within `SOON_DAYS` is amber; later is neutral. `today` is the phone's day. */
export function upcomingTone(item: Pick<Upcoming, "due_on">, today: string): UpcomingTone {
  const days = daysBetween(today, item.due_on);
  return days < 0 ? "red" : days <= SOON_DAYS ? "yellow" : null;
}

/** When an item is due, for its row: "Thu Nov 6" or "Thu Nov 6, 9:30 AM". */
export function dueText(item: Pick<Upcoming, "due_on" | "due_time">): string {
  return item.due_time ? `${dayText(item.due_on)}, ${timeText(item.due_time)}` : dayText(item.due_on);
}

/** "every 2 weeks", "every month", "every 3 years". */
export function repeatText(every: number | null, unit: RepeatUnit | null): string {
  if (!every || !unit) return "";
  return every === 1 ? `every ${unit}` : `every ${every} ${unit}s`;
}

/** The line under the pills on Log: the first open item, coloured as in the tab. None when nothing is open. */
export function nextLine(items: readonly Upcoming[], today: string): { text: string; tone: UpcomingTone; id: string } | null {
  const first = openItems(items)[0];
  if (!first) return null;
  const tone = upcomingTone(first, today);
  return { text: `Next: ${first.title} · ${dayText(first.due_on)}${tone === "red" ? " · overdue" : ""}`, tone, id: first.id };
}

/* ── Done ────────────────────────────────────────────────────────────────── */

/** Vet visits and vaccines are closed by a saved visit; medication and other just by Done. */
export const needsVisit = (kind: UpcomingKind) => kind === "vet" || kind === "vaccine";

/**
 * What the Health → Vet visit form opens with for a Done on a vet visit or vaccine: the item's day (at
 * its time, or noon), a vaccine's reason, and the title as the note. A vet visit's reason is picked only
 * when its title says which; otherwise it is left for the person to pick.
 */
export function visitPrefill(item: Pick<Upcoming, "kind" | "title" | "due_on" | "due_time">): {
  day: string;
  time: string;
  reason: string;
  note: string;
} {
  const reason =
    item.kind === "vaccine"
      ? "vaccines"
      : /follow[- ]?up|re-?check/i.test(item.title)
        ? "follow-up"
        : /check-?up/i.test(item.title)
          ? "checkup"
          : "";
  return { day: item.due_on, time: item.due_time ?? "12:00", reason, note: item.title };
}

/** The next occurrence of a repeating item that was just done, or null when it does not repeat. */
export function repeatOf(item: Upcoming): UpcomingInput | null {
  if (!item.repeat_every || !item.repeat_unit) return null;
  return {
    kind: item.kind,
    title: item.title,
    due_on: nextDue(item.due_on, item.repeat_every, item.repeat_unit),
    due_time: item.due_time,
    note: item.note,
    repeat_every: item.repeat_every,
    repeat_unit: item.repeat_unit,
  };
}

/**
 * A Done that waits for a visit: save the visit, and only if it saved, close the item. A visit that
 * fails to save (it stays on screen with its Retry) closes nothing, and an item whose form was closed
 * without saving was never closed at all.
 */
export async function saveThenClose<B>(
  saveOne: (body: B) => Promise<boolean>,
  close: (body: B) => Promise<void>,
  body: B
): Promise<boolean> {
  if (!(await saveOne(body))) return false;
  await close(body);
  return true;
}

/* ── What the server accepts ─────────────────────────────────────────────── */

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** An item from what the form sends. Anything wrong is an `InvalidEvent` (a 400), never a guess. */
export function parseUpcoming(raw: unknown): UpcomingInput {
  if (!isObject(raw)) throw new InvalidEvent("send the item as an object");
  const kind = raw.kind;
  if (typeof kind !== "string" || !UPCOMING_KINDS.includes(kind as UpcomingKind)) {
    throw new InvalidEvent(`kind must be ${UPCOMING_KINDS.join(", ")}`);
  }
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title || title.length > TITLE_MAX) throw new InvalidEvent(`the title must be 1 to ${TITLE_MAX} characters`);
  if (!isDay(raw.due_on)) throw new InvalidEvent("due_on must be a day, YYYY-MM-DD");

  let due_time: string | null = null;
  if (raw.due_time !== undefined && raw.due_time !== null && raw.due_time !== "") {
    const m = typeof raw.due_time === "string" ? /^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/.exec(raw.due_time) : null;
    if (!m) throw new InvalidEvent("due_time must be a time, HH:MM");
    due_time = `${m[1]}:${m[2]}`;
  }

  let note: string | null = null;
  if (raw.note !== undefined && raw.note !== null) {
    if (typeof raw.note !== "string") throw new InvalidEvent("the note must be text");
    note = raw.note.trim() || null;
    if (note && note.length > NOTE_MAX) throw new InvalidEvent(`the note must be ${NOTE_MAX} characters or fewer`);
  }

  const hasEvery = raw.repeat_every !== undefined && raw.repeat_every !== null && raw.repeat_every !== "";
  const hasUnit = raw.repeat_unit !== undefined && raw.repeat_unit !== null && raw.repeat_unit !== "";
  let repeat_every: number | null = null;
  let repeat_unit: RepeatUnit | null = null;
  if (hasEvery || hasUnit) {
    if (typeof raw.repeat_every !== "number" || !Number.isInteger(raw.repeat_every) || raw.repeat_every < 1 || raw.repeat_every > REPEAT_MAX) {
      throw new InvalidEvent(`repeat_every must be a whole number from 1 to ${REPEAT_MAX}`);
    }
    if (typeof raw.repeat_unit !== "string" || !REPEAT_UNITS.includes(raw.repeat_unit as RepeatUnit)) {
      throw new InvalidEvent(`repeat_unit must be ${REPEAT_UNITS.join(", ")}`);
    }
    repeat_every = raw.repeat_every;
    repeat_unit = raw.repeat_unit as RepeatUnit;
  }

  return { kind: kind as UpcomingKind, title, due_on: raw.due_on as string, due_time, note, repeat_every, repeat_unit };
}

/** What a request to `/api/upcoming` asks for. */
export type UpcomingAction =
  | { action: "add"; item: UpcomingInput }
  | { action: "edit"; id: string; item: UpcomingInput }
  | { action: "cancel"; id: string }
  | { action: "done"; id: string; done_on: string; done_event: string | null };

export function parseAction(raw: unknown): UpcomingAction {
  if (!isObject(raw)) throw new InvalidEvent("send an action");
  switch (raw.action) {
    case "add":
      return { action: "add", item: parseUpcoming(raw.item) };
    case "edit":
    case "cancel":
    case "done": {
      if (!isUuid(raw.id)) throw new InvalidEvent("id must be an item's id");
      const id = raw.id.toLowerCase();
      if (raw.action === "edit") return { action: "edit", id, item: parseUpcoming(raw.item) };
      if (raw.action === "cancel") return { action: "cancel", id };
      if (!isDay(raw.done_on)) throw new InvalidEvent("done_on must be a day, YYYY-MM-DD");
      const ev = raw.done_event;
      if (ev !== undefined && ev !== null && !isUuid(ev)) throw new InvalidEvent("done_event must be a saved visit's id");
      return { action: "done", id, done_on: raw.done_on, done_event: typeof ev === "string" ? ev.toLowerCase() : null };
    }
    default:
      throw new InvalidEvent("action must be add, edit, cancel or done");
  }
}
