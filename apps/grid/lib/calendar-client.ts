/* Stamped from packages/shared/lib/calendar-client.ts — do not edit this copy.
 * Edit the canonical file, then run: node scripts/stamp-shared.mjs
 * drift fails a copy that disagrees, and CI runs drift. */
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
