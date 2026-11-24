import { addDays, isDay } from "../days";
import { Invalid } from "../validate";
import {
  DENVER,
  GraphError,
  calendarView,
  credentials,
  listCalendars,
  refreshTokens,
  type Credentials,
  type FetchLike,
  type GraphView,
} from "./graph";
import { LOCK_SECONDS } from "./flush";
import type { Store } from "./store";

/**
 * The read side of the calendar contract: the household Outlook's events for the
 * 7 days from `start`, across every calendar on the account, repeats expanded,
 * as Denver wall-clock. Titles only.
 *
 * - **Nothing is cached or stored.** The one write is unavoidable: Microsoft
 *   replaces the refresh token on every use, so the new one is saved before
 *   anything else (the same rule and the same lock as the flush).
 * - **A failure is never an empty list.** Every way this can fail is a value of
 *   its own, and the route turns it into a status.
 */
export type WeekEvent = { calendar: string; title: string; start: string; end: string; all_day: boolean };
export type WeekResult =
  | { ok: true; events: WeekEvent[] }
  | { ok: false; kind: "not_connected" }
  | { ok: false; kind: "busy" }
  | { ok: false; kind: "graph"; short: string };

export type WeekDeps = { store: Store; fetchImpl?: FetchLike; creds?: Credentials | null };

/** `?start=`: a real calendar day, or a refusal that names the field and never repeats the value. */
export function parseStart(raw: string | null): string {
  if (raw === null || raw === "") throw new Invalid("start is required (YYYY-MM-DD)");
  if (!isDay(raw)) throw new Invalid("start must be a day as YYYY-MM-DD");
  return raw;
}

const DENVER_ZONES = new Set([DENVER, "America/Denver"]);

/**
 * One Graph occurrence as the contract's event, or null when it is cancelled or
 * falls outside the week. A timed event's time is kept as Graph gave it (already
 * Denver, asked for with the `Prefer` header); an all-day one is a date only,
 * with Graph's exclusive end turned into the last day, inclusive. A time zone
 * other than Denver is a failure, never a silently wrong time.
 */
export function toWeekEvent(calendar: string, v: GraphView, start: string): WeekEvent | null {
  if (v.isCancelled) return null;
  const s = v.start?.dateTime;
  const e = v.end?.dateTime;
  if (typeof s !== "string" || typeof e !== "string" || s.length < 16 || e.length < 16) throw new GraphError(200, "bad_event");
  const title = typeof v.subject === "string" ? v.subject : "";
  const last = addDays(start, 6);
  if (v.isAllDay) {
    // An all-day event is a floating date: take the date part as given, never convert it.
    const first = s.slice(0, 10);
    const endExclusive = e.slice(0, 10);
    if (!isDay(first) || !isDay(endExclusive)) throw new GraphError(200, "bad_event");
    const lastDay = addDays(endExclusive, -1);
    const end = lastDay < first ? first : lastDay;
    if (end < start || first > last) return null;
    return { calendar, title, start: first, end, all_day: true };
  }
  if (!DENVER_ZONES.has(v.start.timeZone) || !DENVER_ZONES.has(v.end.timeZone)) throw new GraphError(200, "bad_time_zone");
  const from = s.slice(0, 16);
  const to = e.slice(0, 16);
  if (!isDay(from.slice(0, 10)) || !isDay(to.slice(0, 10))) throw new GraphError(200, "bad_event");
  // Keep what overlaps [start 00:00, the day after the last day 00:00).
  if (to <= `${start}T00:00` || from >= `${addDays(last, 1)}T00:00`) return null;
  return { calendar, title, start: from, end: to, all_day: false };
}

export async function weekEvents(deps: WeekDeps, start: string): Promise<WeekResult> {
  const { store } = deps;
  const f: FetchLike = deps.fetchImpl ?? ((u, i) => fetch(u, i));
  const creds = deps.creds === undefined ? credentials() : deps.creds;
  if (!creds) return { ok: false, kind: "not_connected" };
  const refreshToken = await store.getRefreshToken();
  if (!refreshToken) return { ok: false, kind: "not_connected" };
  // The flush and this read must not refresh at once: the second would use a token Microsoft has already replaced.
  if (!(await store.tryLock(LOCK_SECONDS))) return { ok: false, kind: "busy" };
  try {
    const t = await refreshTokens(f, creds, (await store.getRefreshToken()) ?? refreshToken);
    await store.saveRefreshToken(t.refreshToken);
    // The window is padded a day each side in UTC (Denver is behind UTC) and trimmed to the week by wall-clock below.
    const from = `${addDays(start, -1)}T00:00:00Z`;
    const to = `${addDays(start, 8)}T00:00:00Z`;
    const events: WeekEvent[] = [];
    for (const c of await listCalendars(f, t.accessToken)) {
      for (const v of await calendarView(f, t.accessToken, c.id, from, to)) {
        const e = toWeekEvent(c.name, v, start);
        if (e) events.push(e);
      }
    }
    events.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.calendar.localeCompare(b.calendar) || a.title.localeCompare(b.title));
    return { ok: true, events };
  } catch (e) {
    if (e instanceof GraphError) return { ok: false, kind: "graph", short: e.short };
    throw e;
  } finally {
    await store.unlock();
  }
}
