import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// TEC-165: deleting a meal hides it and keeps it. The fake below is a small
// in-memory `health` schema that honours `eq`, `is`, `in`, `update` and
// `delete`, so these tests assert what a caller sees, not which calls were made.

type Row = Record<string, unknown>;
const db: { entries: Row[]; entry_items: Row[]; items: Row[] } = { entries: [], entry_items: [], items: [] };
let failWith: string | null = null;

function table(name: keyof typeof db) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "update" | "delete" = "select";
  let patch: Row = {};
  const run = () => {
    if (failWith) return { data: null, error: { message: failWith } };
    const hit = db[name].filter((r) => filters.every((f) => f(r)));
    if (op === "update") hit.forEach((r) => Object.assign(r, patch));
    if (op === "delete") db[name] = db[name].filter((r) => !hit.includes(r));
    const out = name === "entries" && op === "select"
      ? hit.map((e) => ({ ...e, entry_items: db.entry_items.filter((i) => i.entry_id === e.id) }))
      : hit.map((r) => ({ ...r }));
    return { data: out, error: null };
  };
  const q: Record<string, unknown> = {
    select: () => q,
    update: (p: Row) => { op = "update"; patch = p; return q; },
    delete: () => { op = "delete"; return q; },
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
    is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
    in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; },
    order: () => q,
    then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
  };
  return q;
}

vi.mock("@/lib/supabase", () => ({ getServiceClient: () => ({ from: (n: keyof typeof db) => table(n) }) }));

import { deleteEntry } from "@/lib/entries";
import { readDay } from "@/lib/log";
import { DELETE } from "@/app/api/entries/[id]/route";
import { NextRequest } from "next/server";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const DAY = "2026-01-05";

function line(id: string, entry: string, kcal: number | null): Row {
  return {
    id, entry_id: entry, item_id: "i1", quantity: 1, position: 0,
    resolved_source: "estimate", resolved_model: null, item_version_id: "v1",
    kcal, protein_g: 10, carbs_g: 20, fat_g: 5,
  };
}

beforeEach(() => {
  failWith = null;
  db.items = [{ id: "i1", name: "oats" }];
  db.entries = [
    { id: A, dictated_text: "oats", meal: "breakfast", eaten_on: DAY, created_at: "1", deleted_at: null },
    { id: B, dictated_text: "more oats", meal: "lunch", eaten_on: DAY, created_at: "2", deleted_at: null },
  ];
  db.entry_items = [line("l1", A, 300), line("l2", B, 500)];
});

const call = (id: string) =>
  DELETE(new NextRequest(`http://x/api/entries/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });

describe("deleteEntry", () => {
  it("sets deleted_at and removes nothing", async () => {
    expect(await deleteEntry(A)).toBe(true);
    expect(db.entries).toHaveLength(2);
    expect(db.entry_items).toHaveLength(2);
    expect(Number.isNaN(Date.parse(db.entries[0].deleted_at as string))).toBe(false);
    expect(db.entries[1].deleted_at).toBeNull();
  });

  it("is false for an entry that does not exist", async () => {
    expect(await deleteEntry("00000000-0000-4000-8000-0000000000ff")).toBe(false);
  });

  it("is false the second time, and keeps the first deletion time", async () => {
    await deleteEntry(A);
    const first = db.entries[0].deleted_at;
    expect(await deleteEntry(A)).toBe(false);
    expect(db.entries[0].deleted_at).toBe(first);
  });

  it("throws a LookupError when the update fails", async () => {
    failWith = "boom";
    await expect(deleteEntry(A)).rejects.toThrow(/Couldn't delete that meal: boom/);
  });
});

describe("readDay skips deleted entries", () => {
  it("counts both meals before a delete", async () => {
    const day = await readDay(DAY);
    expect(day.entries.map((e) => e.id)).toEqual([A, B]);
    expect(day.total.kcal).toBe(800);
  });

  it("drops a deleted meal from the list and the total (so Left today gets it back)", async () => {
    await deleteEntry(A);
    const day = await readDay(DAY);
    expect(day.entries.map((e) => e.id)).toEqual([B]);
    expect(day.total).toEqual({ kcal: 500, protein_g: 10, carbs_g: 20, fat_g: 5 });
  });

  it("is an empty day when every meal is deleted", async () => {
    await deleteEntry(A);
    await deleteEntry(B);
    expect(await readDay(DAY)).toEqual({
      date: DAY, entries: [], total: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    });
  });

  it("does not read a deleted meal's lines, even a broken one", async () => {
    db.entry_items = [line("l1", A, null), line("l2", B, 500)];
    await deleteEntry(A);
    expect((await readDay(DAY)).total.kcal).toBe(500);
  });
});

describe("DELETE /api/entries/[id]", () => {
  it("answers 200 and keeps the rows", async () => {
    const res = await call(A);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: A });
    expect(db.entries).toHaveLength(2);
    expect(db.entry_items).toHaveLength(2);
  });

  it("answers 404 for an already-deleted meal", async () => {
    await call(A);
    expect((await call(A)).status).toBe(404);
  });

  it("answers 404 for a malformed id and 503 when the database fails", async () => {
    expect((await call("nope")).status).toBe(404);
    failWith = "down";
    expect((await call(B)).status).toBe(503);
  });
});

describe("the migration", () => {
  it("adds a nullable deleted_at to health.entries and nothing destructive", () => {
    const dir = resolve(__dirname, "../../../supabase/migrations");
    const name = readdirSync(dir).find((f) => f.endsWith("_health_entries_deleted_at.sql"));
    expect(name).toBe("20261102001200_health_entries_deleted_at.sql");
    const sql = readFileSync(resolve(dir, name!), "utf8").replace(/^--.*$/gm, "");
    expect(sql).toMatch(/alter table health\.entries add column deleted_at timestamptz;/);
    expect(sql).not.toMatch(/not null|drop |delete from|truncate/i);
  });
});
