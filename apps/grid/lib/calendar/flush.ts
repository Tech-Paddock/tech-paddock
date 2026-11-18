import {
  GraphError,
  calendarName,
  createCalendar,
  createEvent,
  credentials,
  deleteEvent,
  refreshTokens,
  toGraphEvent,
  updateEvent,
  type Credentials,
  type FetchLike,
} from "./graph";
import type { OutboxRow, Store } from "./store";
import type { Upsert } from "./validate";

/**
 * The flush: send every unsent outbox row to Outlook, one calendar per app.
 *
 * - **An outbox row is state, not history to replay.** Several unsent rows for one
 *   (app, source_id) collapse to the newest, and the older ones are stamped sent
 *   with the note "superseded". So a bad row that keeps failing never blocks a
 *   corrected one behind it, and an upsert then a delete does one delete.
 * - **A failure stays unsent** with a short error (`graph 400 ErrorInvalidRecurrence`,
 *   never a message: a message can quote the event) and is retried by the next
 *   flush. Nothing is logged.
 * - **One flush at a time**, through the lock on the connection row: Microsoft
 *   replaces the refresh token on every use, so two flushes refreshing at once
 *   would break the connection. A flush that loses the lock returns `busy`; its
 *   rows are already in the outbox and the holder (or the next flush) sends them.
 * - **The refresh token is saved before anything else is done with the new
 *   access token**, and only when there is something to send.
 */
export const LOCK_SECONDS = 75;
/** No new row is started after this, so the lock outlives the work. */
export const BUDGET_MS = 45_000;
const ROUNDS = 3;

export type FlushResult = { busy: boolean; sent: number; unsent: number; error: string | null };

export type FlushDeps = {
  store: Store;
  fetchImpl?: FetchLike;
  creds?: Credentials | null;
  now?: () => number;
};

async function failAll(store: Store, rows: OutboxRow[], error: string) {
  for (const r of rows) if (r.error !== error) await store.markError(r.id, error);
}

export async function flush(deps: FlushDeps): Promise<FlushResult> {
  const { store } = deps;
  const f: FetchLike = deps.fetchImpl ?? ((u, i) => fetch(u, i));
  const clock = deps.now ?? Date.now;
  const creds = deps.creds === undefined ? credentials() : deps.creds;

  const pending = await store.unsent();
  if (pending.length === 0) return { busy: false, sent: 0, unsent: 0, error: null };
  if (!creds) {
    await failAll(store, pending, "not configured: MS_CLIENT_ID or MS_CLIENT_SECRET is missing");
    return { busy: false, sent: 0, unsent: pending.length, error: "not configured" };
  }
  const refreshToken = await store.getRefreshToken();
  if (!refreshToken) {
    await failAll(store, pending, "not connected: open the connect link");
    return { busy: false, sent: 0, unsent: pending.length, error: "not connected" };
  }
  if (!(await store.tryLock(LOCK_SECONDS))) return { busy: true, sent: 0, unsent: pending.length, error: null };

  const deadline = clock() + BUDGET_MS;
  let sent = 0;
  let error: string | null = null;
  let access: string | null = null;
  // Every row id this flush has looked at: a row that failed is not tried again until the next flush.
  const seen = new Set<string>();

  try {
    for (let round = 0; round < ROUNDS; round++) {
      // Rows appended while this flush ran are picked up by the next round.
      const rows = (round === 0 ? pending : await store.unsent()).filter((r) => !seen.has(r.id));
      if (rows.length === 0) break;
      for (const r of rows) seen.add(r.id);

      if (access === null) {
        try {
          const t = await refreshTokens(f, creds, (await store.getRefreshToken()) ?? refreshToken);
          await store.saveRefreshToken(t.refreshToken);
          access = t.accessToken;
        } catch (e) {
          if (!(e instanceof GraphError)) throw e;
          error = e.short;
          await failAll(store, rows, `refresh failed: ${e.short}${e.code === "invalid_grant" ? " (open the connect link)" : ""}`);
          break;
        }
      }

      // Newest row per (app, source_id) wins; the rest are superseded.
      const newest = new Map<string, OutboxRow>();
      const older = new Map<string, string[]>();
      for (const r of rows) {
        const k = `${r.app}\u0000${r.source_id}`;
        const prev = newest.get(k);
        if (prev) older.set(k, [...(older.get(k) ?? []), prev.id]);
        newest.set(k, r);
      }

      let throttled = false;
      for (const [k, r] of newest) {
        if (clock() > deadline) break;
        try {
          await sendOne(store, f, access, r);
          await store.markSent([r.id]);
          await store.markSent(older.get(k) ?? [], "superseded");
          sent += 1;
        } catch (e) {
          if (!(e instanceof GraphError)) throw e;
          await store.markError(r.id, e.short);
          error = e.short;
          // Throttled: stop and let the next flush try again rather than push harder.
          if (e.status === 429) {
            throttled = true;
            break;
          }
        }
      }
      if (throttled || clock() > deadline) break;
    }
  } finally {
    await store.unlock();
  }
  return { busy: false, sent, unsent: (await store.unsent()).length, error };
}

async function sendOne(store: Store, f: FetchLike, access: string, r: OutboxRow) {
  if (r.op === "delete") {
    const id = await store.getEventId(r.app, r.source_id);
    if (id) await deleteEvent(f, access, id);
    if (id) await store.dropEventId(r.app, r.source_id);
    return;
  }
  const e = r.payload as Upsert;
  let calendarId = await store.getCalendarId(r.app);
  if (!calendarId) {
    calendarId = await createCalendar(f, access, calendarName(r.app));
    await store.saveCalendarId(r.app, calendarId);
  }
  const existing = await store.getEventId(r.app, r.source_id);
  if (existing && (await updateEvent(f, access, existing, toGraphEvent(e)))) {
    await store.saveEventId(r.app, r.source_id, existing);
    return;
  }
  try {
    const id = await createEvent(f, access, calendarId, toGraphEvent(e, r.id));
    await store.saveEventId(r.app, r.source_id, id);
  } catch (err) {
    // The calendar was deleted in Outlook: forget it, so the next flush makes it again.
    if (err instanceof GraphError && err.status === 404) await store.dropCalendarId(r.app);
    throw err;
  }
}
