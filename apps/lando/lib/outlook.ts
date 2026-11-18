import { after } from "next/server";
import { sendCalendarEvent, type CalendarEvent } from "./calendar-client";
import { describe, exercise, liveEvents, potty, type JournalEvent } from "./events";
import type { Upcoming, UpcomingAction } from "./upcoming";

/**
 * Lando's events for the household's Outlook calendar (#67, the contract is Grid's: apps/grid/RULES.md,
 * "Calendar contract"). Lando stays the source of truth and the send is one way: after a database write
 * succeeds the route sends the matching event with `sendCalendarEvent` (the stamped client, never edited).
 *
 * Two calendars, named by the contract's `app` slug ("lando" is "Lando", "lando-log" is "Lando Log"):
 *   - `lando`: plans (`lando.upcoming`). A repeating plan is one recurring event. Done, cancel and an edit
 *     update or remove it; a Done repeat inserts the next plan, which is its own recurring event from its day.
 *   - `lando-log`: logged entries (`lando.events`). A correction removes the old entry's event and sends the
 *     new one; a delete removes it. Notes are never sent (RULES: not in the Log feed).
 *
 * Everything here is pure except `pushEvents` and `pushAfterSave`, which never throw: a calendar that is down
 * must never fail a save, and an event that did not go is sent again by the one-off backfill route.
 * Titles are plain and carry no notes or attachments: anyone a calendar is shared with sees everything in it.
 */

export const APP_PLANS = "lando";
export const APP_LOG = "lando-log";

/** The contract's title limit. */
const TITLE_LIMIT = 200;
/** How long a logged entry sits on the calendar when it has no length of its own. */
export const LOG_MINUTES = 15;
export const TIME_ZONE = "America/Denver";

const pad = (n: number) => String(n).padStart(2, "0");

/** The wall-clock parts of an instant in Denver. */
function denver(iso: string): { day: string; time: string } | null {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(t)
      .map((p) => [p.type, p.value])
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** `YYYY-MM-DDTHH:mm` plus whole minutes, still wall-clock (the arithmetic is done in UTC so no zone moves it). */
export function addMinutes(wall: string, minutes: number): string {
  const [d, t] = wall.split("T");
  const [y, mo, day] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  const x = new Date(Date.UTC(y, mo - 1, day, h, mi + minutes));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}T${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
}

const plain = (words: string) => words.replace(/\s*·\s*/g, ", ").replace(/\s+/g, " ").trim();
const titled = (words: string) => {
  const t = `Lando: ${plain(words)}`;
  return t.length > TITLE_LIMIT ? t.slice(0, TITLE_LIMIT) : t;
};

const FREQ = { week: "weekly", month: "monthly", year: "yearly" } as const;

/** A plan as its calendar event: all-day when it has no time, recurring when it repeats. */
export function planEvent(item: Pick<Upcoming, "id" | "title" | "due_on" | "due_time" | "repeat_every" | "repeat_unit">): CalendarEvent {
  const timed = !!item.due_time;
  return {
    app: APP_PLANS,
    source_id: item.id,
    op: "upsert",
    title: titled(item.title),
    start: timed ? `${item.due_on}T${item.due_time!.slice(0, 5)}` : item.due_on,
    ...(timed ? {} : { all_day: true }),
    ...(item.repeat_unit && item.repeat_every
      ? { recurrence: { freq: FREQ[item.repeat_unit], interval: item.repeat_every } }
      : {}),
  };
}

export const planDelete = (id: string): CalendarEvent => ({ app: APP_PLANS, source_id: id, op: "delete" });
export const entryDelete = (id: string): CalendarEvent => ({ app: APP_LOG, source_id: id, op: "delete" });

/** What a logged entry's event holds, or null for an entry that has none (a note, a void). */
export function entryEvent(e: JournalEvent): CalendarEvent | null {
  if (e.kind === "note" || e.kind === "void") return null;
  const { title, detail } = describe(e);
  if (!title) return null;
  const when = denver(e.at);
  if (!when) return null;
  const words = titled(detail ? `${title}, ${detail}` : title);
  // A weight is a day, not a moment: all-day.
  if (e.kind === "weight") return { app: APP_LOG, source_id: e.id, op: "upsert", title: words, start: when.day, all_day: true };
  const start = `${when.day}T${when.time}`;
  const minutes = e.kind === "exercise" ? exercise(e).minutes : e.kind === "potty" ? potty(e).minutes : undefined;
  const length = typeof minutes === "number" && minutes > 0 ? minutes : LOG_MINUTES;
  return { app: APP_LOG, source_id: e.id, op: "upsert", title: words, start, end: addMinutes(start, length) };
}

/** What a saved journal write sends: a new entry's event, and the removal of the entry a correction or delete voids. */
export function eventsAfterEntry(saved: JournalEvent): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  if (saved.voids) out.push(entryDelete(saved.voids));
  const own = entryEvent(saved);
  if (own) out.push(own);
  return out;
}

/** What a saved plan action sends. `item` is the row written and `next` the repeat a Done inserted. */
export function eventsAfterPlan(action: UpcomingAction, result: { item: Upcoming; next: Upcoming | null }): CalendarEvent[] {
  if (action.action === "add" || action.action === "edit") return [planEvent(result.item)];
  const out: CalendarEvent[] = [planDelete(result.item.id)];
  if (result.next) out.push(planEvent(result.next));
  return out;
}

/** The events a backfill sends: every open plan, and each live entry from the last `days` days (notes never). */
export function backfillEvents(plans: readonly Upcoming[], journal: readonly JournalEvent[], now: Date, days = 30): CalendarEvent[] {
  const from = now.getTime() - days * 86_400_000;
  const entries = liveEvents([...journal])
    .filter((e) => Date.parse(e.at) >= from && Date.parse(e.at) <= now.getTime())
    .map(entryEvent)
    .filter((e): e is CalendarEvent => e !== null);
  return [...plans.filter((p) => p.status === "open").map(planEvent), ...entries];
}

type Req = { headers: { get(name: string): string | null } };
type Send = typeof sendCalendarEvent;

/** Sends in order, one after another. Never throws; returns how many Grid took. */
export async function pushEvents(req: Req, events: readonly CalendarEvent[], send: Send = sendCalendarEvent): Promise<number> {
  let ok = 0;
  for (const event of events) {
    try {
      if ((await send(req, event)).ok) ok++;
    } catch {
      /* the client never throws; this keeps that true here too */
    }
  }
  return ok;
}

/**
 * After a save: send the events once the response is on its way (Next's `after`), so a slow calendar never holds
 * a save. Outside a request (a test) there is no `after`, so it sends and waits. Never throws.
 */
export async function pushAfterSave(req: Req, build: () => CalendarEvent[], send: Send = sendCalendarEvent): Promise<void> {
  try {
    const events = build();
    if (events.length === 0) return;
    try {
      after(() => pushEvents(req, events, send));
    } catch {
      await pushEvents(req, events, send);
    }
  } catch {
    /* a calendar problem is never a save problem */
  }
}
