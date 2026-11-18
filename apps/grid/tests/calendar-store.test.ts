import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCalendarClient, supabaseStore } from "@/lib/calendar/store";
import { getServiceClient } from "@/lib/supabase";
import { fakeDb } from "./fakeDb";

const APP = resolve(__dirname, "..");
const REPO = resolve(APP, "../..");
const ENV = { ...process.env };
beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-for-tests";
});
afterEach(() => {
  process.env = { ...ENV };
});

describe("the calendar client", () => {
  it("is pinned to the calendar schema, and Grid's own client stays pinned to grid", () => {
    expect(getCalendarClient().from("outbox")["schema" as never]).toBe("calendar");
    expect(getServiceClient().from("tasks")["schema" as never]).toBe("grid");
  });
});

describe("the store", () => {
  it("never deletes from the outbox: the source has no such call, and a trigger refuses it as well", () => {
    const src = readFileSync(join(APP, "lib/calendar/store.ts"), "utf8").replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, "$1");
    expect(src).not.toMatch(/from\("outbox"\)\s*\.delete\(/);
    expect(src).toMatch(/from\("outbox"\)\s*\.insert\(/);
  });

  it("marking sent writes only sent_at and error", async () => {
    const { db, calls } = fakeDb();
    await supabaseStore(db, () => new Date("2026-11-17T12:00:00Z")).markSent(["a", "b"], "superseded");
    const update = calls[0].ops.find(([n]) => n === "update")![1][0] as Record<string, unknown>;
    expect(calls[0].table).toBe("outbox");
    expect(Object.keys(update).sort()).toEqual(["error", "sent_at"]);
  });

  it("the lock is one atomic update that matches only an unheld or expired lock", async () => {
    const { db, calls } = fakeDb(() => ({ data: [{ id: true }] }));
    const store = supabaseStore(db, () => new Date("2026-11-17T12:00:00Z"));
    expect(await store.tryLock(75)).toBe(true);
    const ops = Object.fromEntries(calls[0].ops.map(([n, a]) => [n, a]));
    expect(ops.update[0]).toEqual({ locked_until: "2026-11-17T12:01:15.000Z" });
    expect(ops.or[0]).toBe("locked_until.is.null,locked_until.lt.2026-11-17T12:00:00.000Z");
    const held = supabaseStore(fakeDb(() => ({ data: [] })).db);
    expect(await held.tryLock(75)).toBe(false);
  });

  it("a database error is reduced to its code", async () => {
    const store = supabaseStore(fakeDb(() => ({ error: { code: "42501", message: "permission denied, row: Vet visit" } })).db);
    const err = await store.getRefreshToken().catch((e) => e);
    expect(err.code).toBe("42501");
    expect(String(err.message)).not.toContain("Vet visit");
  });
});

describe("the migrations", () => {
  const files = readdirSync(join(REPO, "supabase/migrations")).filter((n) => /calendar/.test(n)).sort();
  const sql = files.map((n) => readFileSync(join(REPO, "supabase/migrations", n), "utf8")).join("\n");

  it("are the create then the grants, additive", () => {
    expect(files.map((n) => n.replace(/^\d+_/, ""))).toEqual(["create_calendar_schema.sql", "grant_calendar_schema_usage.sql"]);
    expect(sql).not.toMatch(/\bdrop\b|\bdelete from\b|\btruncate\b/i);
  });

  it("every table has RLS enabled and there is not one policy", () => {
    const tables = [...sql.matchAll(/create table calendar\.(\w+)/g)].map((m) => m[1]);
    expect(tables.sort()).toEqual(["calendars", "connection", "events", "outbox"]);
    for (const t of tables) expect(sql).toContain(`alter table calendar.${t} enable row level security`);
    expect(sql).not.toMatch(/create policy/i);
  });

  it("the outbox is append-only: a trigger refuses a delete and any update but sent_at and error", () => {
    expect(sql).toMatch(/before update or delete on calendar\.outbox/);
    expect(sql).toMatch(/raise exception 'calendar\.outbox is append-only'/);
    expect(sql).toMatch(/set search_path = ''/);
  });

  it("config.toml exposes the schema to the local API", () => {
    expect(readFileSync(join(REPO, "supabase/config.toml"), "utf8")).toMatch(/^schemas = \[.*"calendar".*\]/m);
  });
});
