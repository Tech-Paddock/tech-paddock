import type { OutboxRow, Status, Store } from "@/lib/calendar/store";
import type { Parsed } from "@/lib/calendar/validate";

/**
 * The calendar's Store in memory, and a Graph that answers from a script.
 * Fixtures are invented: nothing here is a real event or person.
 */
export function memoryStore(opts: { token?: string | null; locked?: boolean } = {}) {
  const s = {
    token: opts.token === undefined ? "refresh-0" : opts.token,
    locked: opts.locked ?? false,
    outbox: [] as (OutboxRow & { sent_at: string | null })[],
    calendars: new Map<string, string>(),
    events: new Map<string, string>(),
    tokenSaves: [] as string[],
    seq: 0,
  };
  const store: Store = {
    async getRefreshToken() {
      return s.token;
    },
    async saveRefreshToken(t) {
      s.token = t;
      s.tokenSaves.push(t);
    },
    async tryLock() {
      if (s.locked) return false;
      s.locked = true;
      return true;
    },
    async unlock() {
      s.locked = false;
    },
    async append(row) {
      const id = `row-${++s.seq}`;
      s.outbox.push({ id, ...row, created_at: `2026-11-17T00:00:${String(s.seq).padStart(2, "0")}Z`, error: null, sent_at: null });
      return id;
    },
    async unsent() {
      return s.outbox.filter((r) => r.sent_at === null);
    },
    async markSent(ids, note) {
      for (const r of s.outbox) if (ids.includes(r.id)) Object.assign(r, { sent_at: "now", error: note ?? null });
    },
    async markError(id, error) {
      for (const r of s.outbox) if (r.id === id) r.error = error;
    },
    async getCalendarId(app) {
      return s.calendars.get(app) ?? null;
    },
    async saveCalendarId(app, id) {
      s.calendars.set(app, id);
    },
    async dropCalendarId(app) {
      s.calendars.delete(app);
    },
    async getEventId(app, src) {
      return s.events.get(`${app}/${src}`) ?? null;
    },
    async saveEventId(app, src, id) {
      s.events.set(`${app}/${src}`, id);
    },
    async dropEventId(app, src) {
      s.events.delete(`${app}/${src}`);
    },
    async status(): Promise<Status> {
      const unsent = s.outbox.filter((r) => r.sent_at === null);
      return { connected: s.token !== null, last_sync: null, unsent: unsent.length, last_error: unsent.findLast((r) => r.error)?.error ?? null };
    },
  };
  const add = (p: Parsed) => store.append({ app: p.app, source_id: p.source_id, op: p.op, payload: p });
  return { s, store, add };
}

export type Call = { method: string; url: string; body: unknown };

/**
 * A Graph that records every call and answers from `handler(call)` (a status and a
 * JSON body), defaulting to the happy path: tokens, new ids for every create.
 */
export function fakeGraph(handler?: (c: Call) => { status: number; body?: unknown } | undefined) {
  const calls: Call[] = [];
  let n = 0;
  const fetchImpl = async (url: string, init?: RequestInit) => {
    const raw = init?.body;
    const body = raw instanceof URLSearchParams ? Object.fromEntries(raw) : typeof raw === "string" ? JSON.parse(raw) : undefined;
    const call: Call = { method: init?.method ?? "GET", url, body };
    calls.push(call);
    const custom = handler?.(call);
    if (custom) return new Response(JSON.stringify(custom.body ?? {}), { status: custom.status });
    if (url.endsWith("/oauth2/v2.0/token")) return Response.json({ access_token: `access-${calls.length}`, refresh_token: `refresh-${calls.length}` });
    if (call.method === "DELETE") return new Response(null, { status: 204 });
    if (call.method === "PATCH") return Response.json({ id: "patched" });
    return Response.json({ id: `graph-${++n}` });
  };
  return { calls, fetchImpl };
}
