import { addDays, weekdayOf } from "../days";
import { WEEKDAYS, type Upsert } from "./validate";

/**
 * Microsoft Graph, and nothing else. Pure mapping first, then the few calls.
 * Every call takes a `fetch` so tests run with a fake: Microsoft cannot be
 * reached from here, so the mapping below is the part that is proven.
 *
 * - **Personal accounts only:** the `consumers` endpoint, scopes
 *   `Calendars.ReadWrite offline_access`.
 * - **Nothing here logs or returns a Graph message.** A failure is reduced to
 *   `GraphError(status, code)`: the message of a Graph error can quote the event.
 */
export const AUTHORIZE_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
export const TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
export const GRAPH = "https://graph.microsoft.com/v1.0";
export const SCOPES = "Calendars.ReadWrite offline_access";

/**
 * Graph's name for America/Denver (it knows Windows names for certain, and this
 * one carries daylight saving). Every event is written in it; the contract's
 * times are Denver wall-clock.
 */
export const DENVER = "Mountain Standard Time";
export const REQUEST_TIMEOUT_MS = 15000;

export class GraphError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(`Graph ${status} ${code}`);
  }
  /** The short form kept on an outbox row. Never a message. */
  get short() {
    return `graph ${this.status} ${this.code}`;
  }
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export const realFetch: FetchLike = (url, init) => fetch(url, init);

/** The cookie that carries the connect flow's `state` from the connect route to the callback. */
export const STATE_COOKIE = "calendar_oauth_state";
export type Credentials = { clientId: string; clientSecret: string };

export function credentials(env: Record<string, string | undefined> = process.env): Credentials | null {
  const clientId = env.MS_CLIENT_ID?.trim();
  const clientSecret = env.MS_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** "sunday" to "saturday" for a day string. */
export const weekdayName = (day: string) => WEEKDAYS[weekdayOf(day)];

type GraphRecurrence = {
  pattern: Record<string, unknown>;
  range: Record<string, unknown>;
};

/** The contract's repeat as Graph's `patternedRecurrence`. The first occurrence is the event's own start day. */
export function toGraphRecurrence(r: NonNullable<Upsert["recurrence"]>, start: string): GraphRecurrence {
  const startDay = start.slice(0, 10);
  const [, month, dom] = startDay.split("-").map(Number);
  const base = { interval: r.interval };
  let pattern: Record<string, unknown>;
  switch (r.freq) {
    case "daily":
      pattern = { type: "daily", ...base };
      break;
    case "weekly":
      pattern = { type: "weekly", ...base, daysOfWeek: r.days_of_week ?? [weekdayName(startDay)], firstDayOfWeek: "sunday" };
      break;
    case "monthly":
      pattern = { type: "absoluteMonthly", ...base, dayOfMonth: dom };
      break;
    default:
      pattern = { type: "absoluteYearly", ...base, month, dayOfMonth: dom };
  }
  const range = r.until ? { type: "endDate", startDate: startDay, endDate: r.until } : { type: "noEnd", startDate: startDay };
  return { pattern, range };
}

/**
 * The event body for a create or an update. An all-day event is midnight to
 * midnight with `isAllDay`, and Graph's end is the day AFTER the last day, so the
 * contract's inclusive last day gets one added here and nowhere else.
 */
export function toGraphEvent(e: Upsert, transactionId?: string): Record<string, unknown> {
  const start = e.all_day ? `${e.start}T00:00:00` : e.start;
  const end = e.all_day ? `${addDays(e.end, 1)}T00:00:00` : e.end;
  return {
    subject: e.title,
    body: { contentType: "text", content: e.notes ?? "" },
    start: { dateTime: start, timeZone: DENVER },
    end: { dateTime: end, timeZone: DENVER },
    isAllDay: e.all_day,
    // An update that drops the repeat must say so: `null` clears it on a PATCH. A create has nothing to clear.
    ...(e.recurrence ? { recurrence: toGraphRecurrence(e.recurrence, e.start) } : transactionId ? {} : { recurrence: null }),
    // A create that died after Graph made the event is sent again with the same id and does not double.
    ...(transactionId ? { transactionId } : {}),
  };
}

/** "lando" -> "Lando", "pit-row" -> "Pit Row". */
export function calendarName(app: string): string {
  return app
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Reduces a failed response to its status and Graph's error code; the body's message is dropped. */
async function failure(res: Response): Promise<GraphError> {
  let code = "unknown";
  try {
    const j = (await res.json()) as { error?: { code?: unknown } | string };
    if (typeof j.error === "string") code = j.error;
    else if (typeof j.error?.code === "string") code = j.error.code;
  } catch {
    /* no body, or not JSON */
  }
  return new GraphError(res.status, code.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 60) || "unknown");
}

async function call(f: FetchLike, url: string, init: RequestInit): Promise<Response> {
  try {
    return await f(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new GraphError(0, "unreachable");
  }
}

export type Tokens = { accessToken: string; refreshToken: string };

async function tokenRequest(f: FetchLike, c: Credentials, params: Record<string, string>): Promise<Tokens> {
  const res = await call(f, TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, scope: SCOPES, ...params }),
  });
  if (!res.ok) throw await failure(res);
  const j = (await res.json()) as { access_token?: unknown; refresh_token?: unknown };
  if (typeof j.access_token !== "string" || typeof j.refresh_token !== "string") throw new GraphError(res.status, "bad_token_response");
  return { accessToken: j.access_token, refreshToken: j.refresh_token };
}

/** Microsoft replaces the refresh token on each use: the caller must save `refreshToken` before doing anything else. */
export const refreshTokens = (f: FetchLike, c: Credentials, refreshToken: string) =>
  tokenRequest(f, c, { grant_type: "refresh_token", refresh_token: refreshToken });

export const exchangeCode = (f: FetchLike, c: Credentials, code: string, redirectUri: string) =>
  tokenRequest(f, c, { grant_type: "authorization_code", code, redirect_uri: redirectUri });

export function authorizeUrl(c: Credentials, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: c.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: SCOPES,
    state,
  });
  return `${AUTHORIZE_URL}?${q}`;
}

function authed(accessToken: string, json = false): Record<string, string> {
  return { authorization: `Bearer ${accessToken}`, accept: "application/json", ...(json ? { "content-type": "application/json" } : {}) };
}

async function idOf(res: Response): Promise<string> {
  const j = (await res.json()) as { id?: unknown };
  if (typeof j.id !== "string" || !j.id) throw new GraphError(res.status, "no_id");
  return j.id;
}

export async function createCalendar(f: FetchLike, accessToken: string, name: string): Promise<string> {
  const res = await call(f, `${GRAPH}/me/calendars`, { method: "POST", headers: authed(accessToken, true), body: JSON.stringify({ name }) });
  if (!res.ok) throw await failure(res);
  return idOf(res);
}

export async function createEvent(f: FetchLike, accessToken: string, calendarId: string, body: Record<string, unknown>): Promise<string> {
  const res = await call(f, `${GRAPH}/me/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: authed(accessToken, true),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await failure(res);
  return idOf(res);
}

/** Updates an event in place. Returns false when Graph no longer has it (a 404), so the caller can create it again. */
export async function updateEvent(f: FetchLike, accessToken: string, eventId: string, body: Record<string, unknown>): Promise<boolean> {
  const res = await call(f, `${GRAPH}/me/events/${encodeURIComponent(eventId)}`, { method: "PATCH", headers: authed(accessToken, true), body: JSON.stringify(body) });
  if (res.status === 404) return false;
  if (!res.ok) throw await failure(res);
  return true;
}

/** Deletes an event; one already gone (404) is the same as deleted. */
export async function deleteEvent(f: FetchLike, accessToken: string, eventId: string): Promise<void> {
  const res = await call(f, `${GRAPH}/me/events/${encodeURIComponent(eventId)}`, { method: "DELETE", headers: authed(accessToken) });
  if (res.status === 404) return;
  if (!res.ok) throw await failure(res);
}
