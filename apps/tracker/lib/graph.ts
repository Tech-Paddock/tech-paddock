/**
 * Microsoft Graph — Outlook calendar and To Do, on one token.
 *
 * Calendar is read as an input, not written as an output. An interview invite
 * is the strongest "this thread moved" signal in the whole system and it
 * arrives without anyone remembering to record anything, which is exactly what
 * the hand-maintained `last_touch_date` was never going to be.
 *
 * It is also the only inbound signal Paddock has. `message_history` records
 * only what you sent, so without the calendar there is no way to tell a thread
 * that went cold because you went quiet from one that went cold because they
 * were not interested — opposite problems with opposite fixes.
 *
 * Personal Microsoft account, so the `consumers` authority rather than a tenant
 * id. Tasks live here too rather than in Google Tasks: same token, same consent,
 * same API, one integration instead of two for a single follow-up loop.
 */

const TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/** Past meetings drive the follow-up gap; future ones drive commitments. */
export const CALENDAR_LOOKBACK_DAYS = 14;
export const CALENDAR_LOOKAHEAD_DAYS = 14;

const REQUEST_TIMEOUT_MS = 6000;

export type GraphEvent = {
  id: string;
  subject: string;
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
  organizerEmail: string | null;
  organizerName: string | null;
  attendeeEmails: string[];
  attendeeNames: string[];
  location: string | null;
};

export class GraphNotConfigured extends Error {
  constructor() {
    super("Outlook is not connected");
    this.name = "GraphNotConfigured";
  }
}

export function graphConfigured(): boolean {
  return !!(
    process.env.MS_GRAPH_CLIENT_ID &&
    process.env.MS_GRAPH_CLIENT_SECRET &&
    process.env.MS_GRAPH_REFRESH_TOKEN
  );
}

/**
 * Access tokens last an hour; a warm serverless instance can reuse one across
 * requests rather than doing the refresh round-trip on every dashboard load.
 * A cold start just pays for it once.
 */
let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (!graphConfigured()) throw new GraphNotConfigured();
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const body = new URLSearchParams({
    client_id: process.env.MS_GRAPH_CLIENT_ID!,
    client_secret: process.env.MS_GRAPH_CLIENT_SECRET!,
    refresh_token: process.env.MS_GRAPH_REFRESH_TOKEN!,
    grant_type: "refresh_token",
    scope: "offline_access Calendars.Read Tasks.ReadWrite",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    cached = null;
    const detail = await res.text().catch(() => "");
    // A refresh token that has been revoked or expired needs a human to redo
    // consent, so say that rather than reporting a generic HTTP failure.
    throw new Error(
      res.status === 400 || res.status === 401
        ? "Outlook refused the stored refresh token — consent needs to be granted again."
        : `Token request failed (${res.status}): ${detail.slice(0, 200)}`
    );
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}

async function graphGet<T>(path: string): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      // Graph otherwise returns local times without an offset, which is how a
      // meeting ends up displayed an hour wrong.
      Prefer: 'outlook.timezone="UTC"',
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Graph ${path} failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** Graph returns `2026-09-11T14:00:00.0000000` with the timezone in a sibling field. */
function asUtcIso(value: { dateTime: string; timeZone?: string } | undefined): string | null {
  if (!value?.dateTime) return null;
  const raw = value.dateTime.replace(/\.\d+$/, "");
  const iso = raw.endsWith("Z") ? raw : `${raw}Z`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

type RawEvent = {
  id: string;
  subject?: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  showAs?: string;
  start?: { dateTime: string; timeZone?: string };
  end?: { dateTime: string; timeZone?: string };
  location?: { displayName?: string };
  organizer?: { emailAddress?: { address?: string; name?: string } };
  attendees?: { emailAddress?: { address?: string; name?: string } }[];
};

export async function fetchCalendar(now = new Date()): Promise<GraphEvent[]> {
  const start = new Date(now.getTime() - CALENDAR_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + CALENDAR_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

  const query = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $select: "id,subject,start,end,isAllDay,isCancelled,showAs,organizer,attendees,location",
    $orderby: "start/dateTime",
    $top: "150",
  });

  const { value } = await graphGet<{ value: RawEvent[] }>(`/me/calendarView?${query}`);

  return (value ?? [])
    .filter((e) => {
      if (e.isCancelled) return false;
      // An all-day block or a "free" hold is not a meeting with anybody.
      if (e.isAllDay) return false;
      if (e.showAs === "free") return false;
      return true;
    })
    .flatMap((e) => {
      const startsAt = asUtcIso(e.start);
      const endsAt = asUtcIso(e.end);
      if (!startsAt || !endsAt) return [];

      const attendees = e.attendees ?? [];
      return [
        {
          id: e.id,
          subject: e.subject?.trim() || "Untitled event",
          startsAt,
          endsAt,
          isAllDay: false,
          organizerEmail: e.organizer?.emailAddress?.address?.toLowerCase() ?? null,
          organizerName: e.organizer?.emailAddress?.name ?? null,
          attendeeEmails: attendees
            .map((a) => a.emailAddress?.address?.toLowerCase())
            .filter((a): a is string => !!a),
          attendeeNames: attendees
            .map((a) => a.emailAddress?.name)
            .filter((a): a is string => !!a),
          location: e.location?.displayName?.trim() || null,
        },
      ];
    });
}

export type CreatedTask = { id: string; webUrl: string | null };

async function graphPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Graph ${path} failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** The To Do list tasks are filed under, created on first use if missing. */
const LIST_NAME = process.env.MS_TODO_LIST_NAME || "Paddock";

let cachedListId: string | null = null;

async function taskListId(): Promise<string> {
  if (cachedListId) return cachedListId;

  const { value } = await graphGet<{ value: { id: string; displayName: string }[] }>(
    "/me/todo/lists"
  );
  const existing = (value ?? []).find((l) => l.displayName === LIST_NAME);
  if (existing) {
    cachedListId = existing.id;
    return existing.id;
  }

  const created = await graphPost<{ id: string }>("/me/todo/lists", { displayName: LIST_NAME });
  cachedListId = created.id;
  return created.id;
}

export async function createTask(input: {
  title: string;
  notes?: string | null;
  dueDate?: Date;
}): Promise<CreatedTask> {
  const listId = await taskListId();
  const due = input.dueDate ?? new Date();

  const task = await graphPost<{ id: string }>(`/me/todo/lists/${listId}/tasks`, {
    title: input.title,
    ...(input.notes ? { body: { content: input.notes, contentType: "text" } } : {}),
    dueDateTime: {
      dateTime: `${due.toISOString().slice(0, 10)}T00:00:00`,
      timeZone: "UTC",
    },
  });

  return { id: task.id, webUrl: null };
}
