import { describe, expect, it } from "vitest";
import type { getServiceClient } from "@/lib/supabase";
type SupabaseClient = ReturnType<typeof getServiceClient>;
import { Conflict, addDog, addPerson, listDogs, readJournal, writeEvent } from "@/lib/journal";
import { InvalidEvent } from "@/lib/events";

/**
 * A stand-in for the few query-builder calls lib/journal.ts makes, over an
 * in-memory table. Only inserts exist: the real table refuses UPDATE and
 * DELETE, and this fake has neither.
 */
type Row = Record<string, any>;
type Err = { code?: string; message: string } | null;

function fakeDb(opts: { failRead?: boolean; insertError?: Err } = {}) {
  const tables: Record<string, Row[]> = { events: [], people: [], dogs: [] };
  const inserts: Row[] = [];

  function builder(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let row: Row | null = null;
    let range: [number, number] | null = null;
    let lim: number | null = null;
    const rows = () => {
      let out = tables[table].filter((r) => filters.every((f) => f(r)));
      if (range) out = out.slice(range[0], range[1] + 1);
      if (lim !== null) out = out.slice(0, lim);
      return out;
    };
    const result = (data: unknown): { data: any; error: Err } =>
      opts.failRead ? { data: null, error: { message: "permission denied for schema lando" } } : { data, error: null };
    const b: any = {
      select: () => b,
      eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), b),
      in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), b),
      or: () => b,
      order: () => b,
      range: (from: number, to: number) => ((range = [from, to]), b),
      limit: (n: number) => ((lim = n), b),
      maybeSingle: async () => result(rows()[0] ?? null),
      insert: (r: Row) => ((row = r), b),
      single: async () => {
        if (row) {
          inserts.push(row);
          if (opts.insertError) return { data: null, error: opts.insertError };
          const full = { id: row.id ?? `person-${tables[table].length + 1}`, at: row.at ?? "2026-10-20T15:00:00.000Z", created_at: "2026-10-20T15:00:00.000Z", ...row };
          tables[table].push(full);
          return { data: full, error: null };
        }
        return result(rows()[0]);
      },
      then: (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) => Promise.resolve(result(rows())).then(ok, fail),
    };
    return b;
  }

  return { db: { from: builder } as unknown as SupabaseClient, tables, inserts };
}

const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";
const PEE = { what: "pee", where: "outside" };
const MEAL = { type: "meal", item_id: "misc" };

describe("writeEvent", () => {
  it("inserts a tap and returns the stored row", async () => {
    const { db, tables } = fakeDb();
    const e = await writeEvent(db, { id: ID, kind: "potty", details: PEE });
    expect(e.id).toBe(ID);
    expect(tables.events).toHaveLength(1);
  });

  it("saving the same tap twice stores it once — a retry never double-logs", async () => {
    const { db, tables } = fakeDb();
    await writeEvent(db, { id: ID, kind: "potty", details: PEE });
    await writeEvent(db, { id: ID, kind: "potty", details: PEE });
    expect(tables.events).toHaveLength(1);
  });

  it("a correction keeps the original's time when it sends none", async () => {
    const { db, tables } = fakeDb();
    await writeEvent(db, { id: ID, kind: "food", at: "2026-10-20T07:00:00Z", details: MEAL });
    const fix = await writeEvent(db, { id: ID2, kind: "food", voids: ID, details: { ...MEAL, amount: 1 } });
    expect(fix.at).toBe("2026-10-20T07:00:00.000Z");
    expect(fix.voids).toBe(ID);
    // The original is still there, untouched.
    expect(tables.events[0]).toMatchObject({ id: ID, details: { amount: null } });
  });

  it("a second change to an already-replaced entry is a conflict, not a fork", async () => {
    const { db } = fakeDb();
    await writeEvent(db, { id: ID, kind: "food", details: MEAL });
    await writeEvent(db, { id: ID2, kind: "void", voids: ID });
    await expect(writeEvent(db, { id: ID3, kind: "food", voids: ID, details: MEAL })).rejects.toBeInstanceOf(Conflict);
  });

  it("a delete never carries a time of its own choosing", async () => {
    const { db, inserts } = fakeDb();
    await writeEvent(db, { id: ID, kind: "potty", details: PEE });
    await writeEvent(db, { id: ID2, kind: "void", voids: ID, at: "2020-01-01T00:00:00Z" });
    expect(inserts[1]).not.toHaveProperty("at");
  });

  it("refuses to void something that is not there", async () => {
    const { db } = fakeDb();
    await expect(writeEvent(db, { id: ID, kind: "void", voids: ID2 })).rejects.toBeInstanceOf(InvalidEvent);
  });

  it("stores the catalogue's snapshot of a food, not the phone's", async () => {
    const { db, inserts } = fakeDb();
    await writeEvent(db, {
      id: ID,
      kind: "food",
      details: { type: "meal", item_id: "purina-pro-plan-toy-puppy-chicken-rice", amount: 0.5, kcal_per: 1 },
    });
    expect(inserts[0].details).toMatchObject({ kcal_per: 447, unit: "cup", amount: 0.5 });
  });

  it("a database failure throws rather than looking saved", async () => {
    const { db } = fakeDb({ insertError: { code: "XX000", message: "boom" } });
    await expect(writeEvent(db, { id: ID, kind: "potty", details: PEE })).rejects.toThrow(/couldn't save/);
  });
});

describe("writeEvent — friends' dogs", () => {
  // Invented: no real dog's name is in the repo (charter, Never 2).
  const DOG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const DOG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const WALK = { type: "walk", where: "outside", with_dogs: true, minutes: 15, treats: 0 };

  it("saves a session naming dogs that are in the list", async () => {
    const { db, tables } = fakeDb();
    tables.dogs.push({ id: DOG_A, name: "Dog A" }, { id: DOG_B, name: "Dog B" });
    const e = await writeEvent(db, { id: ID, kind: "exercise", details: { ...WALK, dogs: [DOG_A, DOG_B] } });
    expect(e.details.dogs).toEqual([DOG_A, DOG_B]);
  });

  it("refuses a dog that is not in the list, and saves nothing", async () => {
    const { db, tables } = fakeDb();
    tables.dogs.push({ id: DOG_A, name: "Dog A" });
    await expect(writeEvent(db, { id: ID, kind: "exercise", details: { ...WALK, dogs: [DOG_A, DOG_B] } })).rejects.toThrow(InvalidEvent);
    expect(tables.events).toHaveLength(0);
  });

  it("needs no dog read for a session that names none", async () => {
    const { db, tables } = fakeDb();
    await writeEvent(db, { id: ID, kind: "exercise", details: WALK });
    expect(tables.events).toHaveLength(1);
  });
});

describe("listDogs", () => {
  it("is an empty list when no dog is added, never an error", async () => {
    expect(await listDogs(fakeDb().db)).toEqual([]);
  });

  it("throws on a failed read", async () => {
    await expect(listDogs(fakeDb({ failRead: true }).db)).rejects.toThrow(/dogs/);
  });
});

describe("readJournal", () => {
  it("throws on a failed read — never an empty journal", async () => {
    const { db } = fakeDb({ failRead: true });
    await expect(readJournal(db, new Date("2026-10-20T06:00:00Z"))).rejects.toThrow(/couldn't read/);
  });

  it("reads every page", async () => {
    const { db, tables } = fakeDb();
    for (let i = 0; i < 2500; i++) tables.events.push({ id: String(i), kind: "potty", at: "2026-10-20T10:00:00Z", details: PEE });
    expect(await readJournal(db, new Date("2026-10-20T06:00:00Z"))).toHaveLength(2500);
  });
});

describe("addPerson", () => {
  it("returns the existing person for the same name in another case", async () => {
    const { db, tables } = fakeDb();
    const a = await addPerson(db, "  Test  Walker ");
    const b = await addPerson(db, "test walker");
    expect(b.id).toBe(a.id);
    expect(tables.people).toHaveLength(1);
    expect(a.display_name).toBe("Test Walker");
  });

  it("refuses an empty or overlong name", async () => {
    const { db } = fakeDb();
    await expect(addPerson(db, "   ")).rejects.toBeInstanceOf(InvalidEvent);
    await expect(addPerson(db, "x".repeat(41))).rejects.toBeInstanceOf(InvalidEvent);
  });
});

describe("addDog", () => {
  // Invented names (charter, Never 2).
  it("adds a dog by its tidied name and returns the row", async () => {
    const { db, tables, inserts } = fakeDb();
    const d = await addDog(db, "  Test   Pup ");
    expect(d.name).toBe("Test Pup");
    expect(inserts).toEqual([{ name: "Test Pup" }]);
    expect(tables.dogs).toHaveLength(1);
  });

  it("returns the existing dog for the same name in another case, never a second row", async () => {
    const { db, tables } = fakeDb();
    tables.dogs.push({ id: ID3, name: "Test Pup" });
    const d = await addDog(db, "test pup");
    expect(d).toEqual({ id: ID3, name: "Test Pup" });
    expect(tables.dogs).toHaveLength(1);
  });

  it("refuses an empty or overlong name", async () => {
    const { db } = fakeDb();
    await expect(addDog(db, "  ")).rejects.toBeInstanceOf(InvalidEvent);
    await expect(addDog(db, "x".repeat(41))).rejects.toBeInstanceOf(InvalidEvent);
    await expect(addDog(db, 7)).rejects.toBeInstanceOf(InvalidEvent);
  });

  it("finds the winner when another phone added the same name first", async () => {
    const { db, tables } = fakeDb({ insertError: { code: "23505", message: "duplicate key" } });
    // The fake records the insert as refused; the other phone's row is what a re-read finds.
    const realFrom = (db as any).from;
    let reads = 0;
    (db as any).from = (t: string) => {
      if (t === "dogs" && ++reads === 2) tables.dogs.push({ id: ID2, name: "Test Pup" });
      return realFrom(t);
    };
    expect(await addDog(db, "Test Pup")).toEqual({ id: ID2, name: "Test Pup" });
  });

  it("throws on a failed read rather than adding blind", async () => {
    await expect(addDog(fakeDb({ failRead: true }).db, "Test Pup")).rejects.toThrow(/dogs/);
  });
});
