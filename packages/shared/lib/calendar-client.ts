import { COOKIES } from "./auth";

/**
 * Sending an event to the household calendar. The one place that knows where
 * the calendar route lives, so moving it later is a one-line change here and a
 * stamp (`node scripts/stamp-shared.mjs`).
 *
 * **The contract is Grid's, in apps/grid/RULES.md** ("Calendar contract"):
 * `POST /api/calendar/events`. Grid holds the one Outlook connection and the
 * `calendar` schema; no app reads that schema or talks to Microsoft.
 *
 * Three rules, each tested in apps/grid/tests/calendar-client.test.ts:
 *
 * - **Only `paddock_session` is forwarded**, by name. Never the whole Cookie
 *   header, and the host is the constant below, never a request field.
 * - **It never throws.** A calendar that is down must not fail the save that
 *   caused the event; the caller gets `{ ok: false }` and carries on. An event
 *   Grid accepted is safe in its outbox even if Outlook is unreachable.
 * - **Nothing is logged here**: an event's title can be a person's own words.
 *
 * Times are Denver wall-clock, never UTC: "YYYY-MM-DDTHH:mm" for a timed event,
 * "YYYY-MM-DD" for an all-day one (`all_day: true`, `end` the last day, inclusive).
 *
 * `fetchCalendarWeek` is the read side (#44, Pit Row): Grid's
 * `GET /api/calendar/week?start=YYYY-MM-DD`, under the same three rules, tested
 * in apps/pitrow/tests/calendar-week.test.ts. It answers a failure as a failure
 * with a reason, never as an empty week.
 */

/** Where the calendar route is hosted today. The only line to change when it moves. */
export const CALENDAR_BASE_URL = "https://grid.techpaddock.io";
export const CALENDAR_EVENTS_PATH = "/api/calendar/events";

/** Long enough for a cold start, short enough that a stuck calendar never holds up a save. */
export const CALENDAR_TIMEOUT_MS = 8000;

export type CalendarRecurrence = {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  /** Every n-th period; 1 when absent. */
  interval?: number;
  /** Weekly only: "sunday" to "saturday". The start's own weekday when absent. */
  days_of_week?: string[];
  /** The last day it repeats, "YYYY-MM-DD", inclusive. Repeats forever when absent. */
  until?: string;
};

export type CalendarEvent =
  | { app: string; source_id: string; op: "delete" }
  | {
      /** The app's slug, lowercase letters, digits and hyphens: it names the calendar ("lando" is "Lando"). */
      app: string;
      /** The app's own id for the thing; one id is one event, and sending it again updates that event. */
      source_id: string;
      op: "upsert";
      title: string;
      start: string;
      end?: string;
      all_day?: boolean;
      recurrence?: CalendarRecurrence;
      notes?: string;
    };

export type SendResult = { ok: boolean };

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** The session cookie's value from a request's Cookie header, or null. */
function sessionOf(request: { headers: { get(name: string): string | null } }): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === COOKIES.SESSION) return part.slice(i + 1).trim() || null;
  }
  return null;
}

/** Sends one event, forwarding the caller's session. Resolves `{ ok: true }` only when Grid answered 200. */
export async function sendCalendarEvent(
  request: { headers: { get(name: string): string | null } },
  event: CalendarEvent,
  options: { baseUrl?: string; fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<SendResult> {
  try {
    const session = sessionOf(request);
    if (!session) return { ok: false };
    const doFetch = options.fetchImpl ?? ((u: string, i: RequestInit) => fetch(u, i));
    const response = await doFetch(`${options.baseUrl ?? CALENDAR_BASE_URL}${CALENDAR_EVENTS_PATH}`, {
      method: "POST",
      headers: { cookie: `${COOKIES.SESSION}=${session}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(event),
      // A signed-out Grid redirects to /login; following it would read as a 200 of HTML.
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? CALENDAR_TIMEOUT_MS),
    });
    return { ok: response.status === 200 };
  } catch {
    return { ok: false };
  }
}

export const CALENDAR_WEEK_PATH = "/api/calendar/week";

/** One event of the week, as Grid's read route answers it. Times are Denver wall-clock. */
export type CalendarWeekEvent = {
  /** The Outlook calendar it sits in ("Pit Row", "Lando", a household one). */
  calendar: string;
  title: string;
  /** "YYYY-MM-DDTHH:mm" for a timed event, "YYYY-MM-DD" for an all-day one. */
  start: string;
  /** Same shape as `start`; for an all-day event, the last day, inclusive. */
  end: string;
  all_day: boolean;
};

/**
 * Why a week could not be read. `not_connected`: Outlook is not connected (503).
 * `microsoft`: Microsoft failed (502). `bad_start`: Grid refused the date (400).
 * `signed_out`: no session, or Grid sent us to sign in. `unavailable`: anything
 * else (a dead network, a timeout, another status, an answer that is not the contract).
 */
export type CalendarWeekError = "not_connected" | "microsoft" | "bad_start" | "signed_out" | "unavailable";

export type CalendarWeekResult = { ok: true; events: CalendarWeekEvent[] } | { ok: false; error: CalendarWeekError };

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_OR_MINUTE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

function eventsOf(body: unknown): CalendarWeekEvent[] | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as { ok?: unknown; events?: unknown };
  if (b.ok !== true || !Array.isArray(b.events)) return null;
  const out: CalendarWeekEvent[] = [];
  for (const e of b.events) {
    if (typeof e !== "object" || e === null) return null;
    const { calendar, title, start, end, all_day } = e as Record<string, unknown>;
    if (typeof calendar !== "string" || typeof title !== "string" || typeof all_day !== "boolean") return null;
    if (typeof start !== "string" || typeof end !== "string" || !DAY_OR_MINUTE.test(start) || !DAY_OR_MINUTE.test(end)) return null;
    // An answer that disagrees with itself is not trusted: an all-day event is a bare day.
    if (all_day !== (start.length === 10)) return null;
    out.push({ calendar, title, start, end, all_day });
  }
  return out;
}

/**
 * The household's events for the seven days from `start` ("YYYY-MM-DD"),
 * forwarding the caller's session. Resolves `{ ok: true, events }` only for a 200
 * that matches the contract; every other outcome is `{ ok: false, error }`, so a
 * failed read can never pass for an empty week. Never throws.
 */
export async function fetchCalendarWeek(
  request: { headers: { get(name: string): string | null } },
  start: string,
  options: { baseUrl?: string; fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<CalendarWeekResult> {
  try {
    if (!DAY_ONLY.test(start)) return { ok: false, error: "bad_start" };
    const session = sessionOf(request);
    if (!session) return { ok: false, error: "signed_out" };
    const doFetch = options.fetchImpl ?? ((u: string, i: RequestInit) => fetch(u, i));
    const response = await doFetch(`${options.baseUrl ?? CALENDAR_BASE_URL}${CALENDAR_WEEK_PATH}?start=${encodeURIComponent(start)}`, {
      method: "GET",
      headers: { cookie: `${COOKIES.SESSION}=${session}`, accept: "application/json" },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? CALENDAR_TIMEOUT_MS),
    });
    if (response.status === 503) return { ok: false, error: "not_connected" };
    if (response.status === 502) return { ok: false, error: "microsoft" };
    if (response.status === 400) return { ok: false, error: "bad_start" };
    if (response.status === 401 || response.status === 403 || (response.status >= 300 && response.status < 400)) {
      return { ok: false, error: "signed_out" };
    }
    if (response.status !== 200) return { ok: false, error: "unavailable" };
    const events = eventsOf(await response.json());
    return events ? { ok: true, events } : { ok: false, error: "unavailable" };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
