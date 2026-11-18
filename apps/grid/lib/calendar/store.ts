import { createClient } from "@supabase/supabase-js";
import { retryingFetch } from "../supabase";
import type { Parsed } from "./validate";

/**
 * The only file that talks to the `calendar` schema. Server-side only.
 *
 * It is a second client, pinned to `calendar`, beside `lib/supabase.ts` (which
 * stays pinned to `grid`): the calendar is not Grid's data and must be able to
 * move without taking any Grid table with it. Nothing here deletes from the
 * outbox (a test reads the source, and the table's trigger refuses it anyway),
 * and no error repeats a row: a database error keeps its code only.
 */
export class StoreError extends Error {
  constructor(public code: string | undefined) {
    super("The calendar database refused the request");
  }
}

export type OutboxRow = { id: string; app: string; source_id: string; op: "upsert" | "delete"; payload: Parsed; created_at: string; error: string | null };

export type Status = {
  connected: boolean;
  /** When the refresh token was last renewed, which is the last time anything reached Microsoft. */
  last_sync: string | null;
  unsent: number;
  last_error: string | null;
};

/** What a flush needs, as an interface, so tests run it against memory and production against the schema. */
export interface Store {
  getRefreshToken(): Promise<string | null>;
  saveRefreshToken(token: string): Promise<void>;
  /** Takes the one flush lock for `seconds`; false when another flush holds it. */
  tryLock(seconds: number): Promise<boolean>;
  unlock(): Promise<void>;
  append(row: { app: string; source_id: string; op: "upsert" | "delete"; payload: Parsed }): Promise<string>;
  unsent(): Promise<OutboxRow[]>;
  markSent(ids: string[], note?: string): Promise<void>;
  markError(id: string, error: string): Promise<void>;
  getCalendarId(app: string): Promise<string | null>;
  saveCalendarId(app: string, graphId: string): Promise<void>;
  dropCalendarId(app: string): Promise<void>;
  getEventId(app: string, sourceId: string): Promise<string | null>;
  saveEventId(app: string, sourceId: string, graphId: string): Promise<void>;
  dropEventId(app: string, sourceId: string): Promise<void>;
  status(): Promise<Status>;
}

export function getCalendarClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  return createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: "calendar" },
    global: { fetch: retryingFetch },
  });
}

type Client = ReturnType<typeof getCalendarClient>;
type Failure = { code?: string } | null;
function check(error: Failure) {
  if (error) throw new StoreError(error.code);
}

export function supabaseStore(db: Client = getCalendarClient(), now: () => Date = () => new Date()): Store {
  return {
    async getRefreshToken() {
      const { data, error } = await db.from("connection").select("refresh_token").maybeSingle();
      check(error);
      return (data?.refresh_token as string | undefined) ?? null;
    },

    async saveRefreshToken(token) {
      // An upsert keeps `locked_until` when the row exists: only the columns named here are written.
      const { error } = await db.from("connection").upsert({ id: true, refresh_token: token, updated_at: now().toISOString() });
      check(error);
    },

    async tryLock(seconds) {
      const t = now();
      const until = new Date(t.getTime() + seconds * 1000).toISOString();
      // Atomic: the update only matches while no one holds an unexpired lock. With no connection row there is nothing to lock, and nothing to flush to.
      const { data, error } = await db
        .from("connection")
        .update({ locked_until: until })
        .eq("id", true)
        .or(`locked_until.is.null,locked_until.lt.${t.toISOString()}`)
        .select("id");
      check(error);
      return (data?.length ?? 0) > 0;
    },

    async unlock() {
      const { error } = await db.from("connection").update({ locked_until: null }).eq("id", true);
      check(error);
    },

    async append(row) {
      const { data, error } = await db.from("outbox").insert(row).select("id").single();
      check(error);
      return data!.id as string;
    },

    async unsent() {
      const { data, error } = await db
        .from("outbox")
        .select("id,app,source_id,op,payload,created_at,error")
        .is("sent_at", null)
        .order("created_at")
        .limit(500);
      check(error);
      return (data ?? []) as OutboxRow[];
    },

    async markSent(ids, note) {
      if (ids.length === 0) return;
      const { error } = await db.from("outbox").update({ sent_at: now().toISOString(), error: note ?? null }).in("id", ids);
      check(error);
    },

    async markError(id, message) {
      const { error } = await db.from("outbox").update({ error: message }).eq("id", id);
      check(error);
    },

    async getCalendarId(app) {
      const { data, error } = await db.from("calendars").select("graph_id").eq("app", app).maybeSingle();
      check(error);
      return (data?.graph_id as string | undefined) ?? null;
    },
    async saveCalendarId(app, graphId) {
      const { error } = await db.from("calendars").upsert({ app, graph_id: graphId });
      check(error);
    },
    async dropCalendarId(app) {
      const { error } = await db.from("calendars").delete().eq("app", app);
      check(error);
    },

    async getEventId(app, sourceId) {
      const { data, error } = await db.from("events").select("graph_id").eq("app", app).eq("source_id", sourceId).maybeSingle();
      check(error);
      return (data?.graph_id as string | undefined) ?? null;
    },
    async saveEventId(app, sourceId, graphId) {
      const { error } = await db.from("events").upsert({ app, source_id: sourceId, graph_id: graphId, updated_at: now().toISOString() });
      check(error);
    },
    async dropEventId(app, sourceId) {
      const { error } = await db.from("events").delete().eq("app", app).eq("source_id", sourceId);
      check(error);
    },

    async status() {
      const [conn, unsent, failed] = await Promise.all([
        db.from("connection").select("updated_at").maybeSingle(),
        db.from("outbox").select("id", { count: "exact", head: true }).is("sent_at", null),
        db.from("outbox").select("error").is("sent_at", null).not("error", "is", null).order("created_at", { ascending: false }).limit(1),
      ]);
      for (const r of [conn, unsent, failed]) check(r.error);
      return {
        connected: conn.data != null,
        last_sync: (conn.data?.updated_at as string | undefined) ?? null,
        unsent: unsent.count ?? 0,
        last_error: (failed.data?.[0]?.error as string | undefined) ?? null,
      };
    },
  };
}
