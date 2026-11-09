// TEC-251: an entry made from another entry stores the id of the one that made it. Nothing shows on screen.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { getServiceClient } from "@/lib/supabase";
import { writeEvent } from "@/lib/journal";
import {
  InvalidEvent,
  inlineTreatEntries,
  parseNewEvent,
  treatsWith,
  visitWeightPlan,
  type JournalEvent,
} from "@/lib/events";
import { saveThen } from "@/lib/saveOrder";

type SupabaseClient = ReturnType<typeof getServiceClient>;

/** The few query-builder calls lib/journal.ts makes, over an in-memory table (as tests/journal.test.ts). */
type Row = Record<string, any>;
type Err = { code?: string; message: string } | null;

function fakeDb(opts: { failRead?: boolean; insertError?: Err } = {}) {
  const tables: Record<string, Row[]> = { events: [], people: [], dogs: [], foods: [] };
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


const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PARENT = u(1);
const CHILD = u(2);
const NOW = new Date("2026-11-08T18:00:00Z");
const AT = "2026-11-08T15:00:00.000Z";
const PEE = { what: "pee", where: "outside", leash: "leashed" };
const TREAT = { type: "treat", item_id: "misc", amount: 2 };

function ev(over: Partial<JournalEvent> & Pick<JournalEvent, "id" | "kind">): JournalEvent {
  return { at: AT, person_id: null, details: {}, note: null, voids: null, created_at: AT, ...over };
}
const treat = (id: string, over: Partial<JournalEvent> = {}) =>
  ev({ id, kind: "food", details: { type: "treat", item_id: "misc", item_name: "Misc", kcal_per: null, unit: "piece", amount: 1 }, ...over });
const training = (id: string, over: Partial<JournalEvent> = {}) =>
  ev({ id, kind: "exercise", details: { type: "training", where: "inside", with_dogs: false, minutes: 10, treats: 1 }, ...over });

describe("a link is read from the request", () => {
  it("keeps a parent id on a treat, a potty and a weight, and none otherwise", () => {
    const food = parseNewEvent({ id: CHILD, kind: "food", details: TREAT, parent_id: PARENT }, NOW);
    expect(food.parent_id).toBe(PARENT);
    expect(parseNewEvent({ id: CHILD, kind: "potty", details: PEE, parent_id: PARENT }, NOW).parent_id).toBe(PARENT);
    expect(parseNewEvent({ id: CHILD, kind: "weight", details: { value: 7, unit: "lb" }, parent_id: PARENT }, NOW).parent_id).toBe(PARENT);
    expect(parseNewEvent({ id: CHILD, kind: "potty", details: PEE }, NOW).parent_id).toBeNull();
  });
  it("refuses a link that is not an id, is to itself, or is on an entry no form makes from another", () => {
    expect(() => parseNewEvent({ id: CHILD, kind: "potty", details: PEE, parent_id: "nope" }, NOW)).toThrow(InvalidEvent);
    expect(() => parseNewEvent({ id: CHILD, kind: "potty", details: PEE, parent_id: CHILD }, NOW)).toThrow(/itself/);
    const run = { type: "walk", where: "outside", with_dogs: false, minutes: 10, treats: 0 };
    expect(() => parseNewEvent({ id: CHILD, kind: "exercise", details: run, parent_id: PARENT }, NOW)).toThrow(/made from another/);
  });
});

describe("the forms put the parent's id on what they make", () => {
  it("a counted treat is made from the entry's id, and none is made at 0", () => {
    const [t] = inlineTreatEntries({ id: CHILD, item_id: "misc", qty: 3 }, AT, null, [], PARENT);
    expect(t.parent_id).toBe(PARENT);
    expect(inlineTreatEntries({ id: CHILD, item_id: "misc", qty: 0 }, AT, null, [], PARENT)).toEqual([]);
  });
  it("a vet visit's weight, new or a correction of the weight, is made from the visit's id", () => {
    const base = { unit: "lb" as const, weightId: CHILD, visitId: PARENT, visitAt: AT, personId: null };
    expect(visitWeightPlan({ ...base, typed: "7.6", linked: null })[0].parent_id).toBe(PARENT);
    const linked = ev({ id: u(9), kind: "weight", details: { value: 7, unit: "lb", visit: u(8) } });
    const [fix] = visitWeightPlan({ ...base, typed: "7.6", linked });
    expect(fix.voids).toBe(linked.id);
    expect(fix.parent_id).toBe(PARENT);
  });
  it("a retry sends the same link, because the ids are fixed when the form opens", async () => {
    const make = () => inlineTreatEntries({ id: CHILD, item_id: "misc", qty: 2 }, AT, null, [], PARENT);
    const sent: unknown[] = [];
    let n = 0;
    const saveOne = async () => ++n > 1; // the parent fails once, then saves on Retry
    await saveThen(saveOne, (t) => void sent.push(t), make()[0], make());
    expect(sent).toEqual([]);
    await saveThen(saveOne, (t) => void sent.push(t), make()[0], make());
    expect(sent).toEqual(make());
  });
  it("Fun's Pee and Poop and the treat count carry saveId.current, and no form makes one from a reused id", () => {
    const form = readFileSync(resolve(__dirname, "../app/LogForm.tsx"), "utf8");
    expect(form).toMatch(/parent_id: saveId\.current/);
    expect(form).toMatch(/foods, body\.id\)/);
    expect(form).toMatch(/const saveId = useRef\(crypto\.randomUUID\(\)\)/);
  });
});

describe("the server stores it", () => {
  it("stores the link, and a retried save is the same row", async () => {
    const { db, tables } = fakeDb();
    await writeEvent(db, { id: PARENT, kind: "exercise", at: AT, details: { type: "training", where: "inside", with_dogs: false, minutes: 5, treats: 1 } });
    const first = await writeEvent(db, { id: CHILD, kind: "food", at: AT, details: TREAT, parent_id: PARENT });
    const again = await writeEvent(db, { id: CHILD, kind: "food", at: AT, details: TREAT, parent_id: PARENT });
    expect(first.parent_id).toBe(PARENT);
    expect(again.parent_id).toBe(PARENT);
    expect(tables.events.filter((r) => r.id === CHILD)).toHaveLength(1);
  });
  it("saves a Fun form's Pee before the Fun entry exists (no foreign key to refuse it)", async () => {
    const { db, tables } = fakeDb();
    await writeEvent(db, { id: CHILD, kind: "potty", details: PEE, parent_id: PARENT });
    expect(tables.events[0].parent_id).toBe(PARENT);
  });
  it("leaves the column out of an entry that has none", async () => {
    const { db, inserts } = fakeDb();
    await writeEvent(db, { id: CHILD, kind: "potty", details: PEE });
    expect(inserts[0]).not.toHaveProperty("parent_id");
  });
  it("a correction of a treat keeps the link; one that names a link uses it; a delete carries none", async () => {
    const { db, inserts } = fakeDb();
    await writeEvent(db, { id: CHILD, kind: "food", at: AT, details: TREAT, parent_id: PARENT });
    await writeEvent(db, { id: u(3), kind: "food", voids: CHILD, details: { ...TREAT, amount: 4 } });
    expect(inserts[1].parent_id).toBe(PARENT);
    await writeEvent(db, { id: u(4), kind: "food", voids: u(3), details: TREAT, parent_id: u(7) });
    expect(inserts[2].parent_id).toBe(u(7));
    await writeEvent(db, { id: u(5), kind: "void", voids: u(4) });
    expect(inserts[3]).not.toHaveProperty("parent_id");
  });
});

describe("treatsWith, old entries and linked ones", () => {
  it("an old treat, with no link, still matches by exact time", () => {
    const t = training(PARENT);
    const old = treat(CHILD);
    const other = treat(u(3), { at: "2026-11-08T15:00:01.000Z" });
    expect(treatsWith([t, old, other], t).map((e) => e.id)).toEqual([CHILD]);
  });
  it("a linked treat matches by its link, at any time", () => {
    const t = training(PARENT);
    const linked = treat(CHILD, { parent_id: PARENT, at: "2026-11-08T09:00:00.000Z" });
    expect(treatsWith([t, linked], t).map((e) => e.id)).toEqual([CHILD]);
  });
  it("a linked treat is never another entry's by time", () => {
    const a = training(PARENT);
    const b = training(u(5));
    const linked = treat(CHILD, { parent_id: u(5) }); // same instant as a
    expect(treatsWith([a, b, linked], a)).toEqual([]);
    expect(treatsWith([a, b, linked], b).map((e) => e.id)).toEqual([CHILD]);
  });
  it("a correction that moves the parent's time keeps its linked treats, and drops an unlinked one", () => {
    const original = training(PARENT);
    const fix = training(u(10), { voids: PARENT, at: "2026-11-08T16:30:00.000Z" });
    const linked = treat(CHILD, { parent_id: PARENT });
    const oldStyle = treat(u(3));
    const added = treat(u(4), { parent_id: u(10) }); // a treat counted while correcting
    const events = [original, fix, linked, oldStyle, added];
    expect(treatsWith(events, fix).map((e) => e.id)).toEqual([CHILD, u(4)]);
  });
  it("a voided or deleted treat is not listed, and a second correction still finds the first's treats", () => {
    const original = training(PARENT);
    const fix1 = training(u(10), { voids: PARENT });
    const fix2 = training(u(11), { voids: u(10) });
    const a = treat(CHILD, { parent_id: PARENT });
    const gone = treat(u(3), { parent_id: PARENT });
    const del = ev({ id: u(4), kind: "void", voids: u(3) });
    expect(treatsWith([original, fix1, fix2, a, gone, del], fix2).map((e) => e.id)).toEqual([CHILD]);
  });
  it("still works for a caller that has no id, by time", () => {
    const old = treat(CHILD);
    expect(treatsWith([old], { at: AT }).map((e) => e.id)).toEqual([CHILD]);
  });
});

describe("migration lando_event_parent", () => {
  const dir = resolve(__dirname, "../../../supabase/migrations");
  const file = readdirSync(dir).find((f) => f.endsWith("_lando_event_parent.sql"))!;
  const sql = readFileSync(resolve(dir, file), "utf8").replace(/--.*$/gm, "");
  it("is one nullable uuid column, additive, with no foreign key", () => {
    expect(sql).toMatch(/ADD COLUMN parent_id uuid,/);
    expect(sql).not.toMatch(/NOT NULL|REFERENCES|\bDROP\b|\bDELETE\b|\bUPDATE\b/i);
  });
  it("sorts after the migration that was newest when it was written", () => {
    expect(file > readdirSync(dir).find((f) => f.endsWith("_lando_medication_reason.sql"))!).toBe(true);
  });
});
