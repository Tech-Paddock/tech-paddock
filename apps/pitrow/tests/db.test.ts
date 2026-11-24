import { describe, expect, it } from "vitest";
import { liveTicks, readWeek, writeCompletion, NotFound } from "@/lib/db";
import { fakeDb } from "./fakeDb";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const V = "33333333-3333-4333-8333-333333333333";
const C = "44444444-4444-4444-8444-444444444444";
const P = "55555555-5555-4555-8555-555555555555";

const row = (id: string, voids: string | null = null) => ({ id, chore_id: C, day: "2026-11-24", person_id: P, voids });

describe("liveTicks", () => {
  it("a tick stands until a void names it; a void is never itself a tick", () => {
    expect(liveTicks([row(A), row(B), row(V, A)]).map((t) => t.id)).toEqual([B]);
    expect(liveTicks([row(A)]).map((t) => t.id)).toEqual([A]);
  });
});

describe("readWeek", () => {
  it("reads the week's ticks and, for once-only chores, every tick, then drops voided ones and those of retired chores", async () => {
    const { db, calls } = fakeDb((call) => {
      if (call.table === "people") return { data: [{ id: P, name: "Sam", archived_at: null }] };
      if (call.table === "chores") return { data: [{ id: C, title: "Bins", cadence: "once", weekdays: null, every_n: null, start_on: "2026-11-20", assignee_id: null }] };
      if (call.ops.some(([op]) => op === "in")) return { data: [row(A), row(V, A)] };
      return { data: [row(B), { ...row("66666666-6666-4666-8666-666666666666"), chore_id: "gone" }] };
    });
    const week = await readWeek("2026-11-22", db);
    expect(week.completions.map((c) => c.id)).toEqual([B]);
    expect(week.people).toEqual([{ id: P, name: "Sam", active: true }]);
    expect(calls.filter((c) => c.table === "completions")).toHaveLength(2);
  });

  it("a database error is an error, never an empty week", async () => {
    const { db } = fakeDb(() => ({ error: { code: "42501" } }));
    await expect(readWeek("2026-11-22", db)).rejects.toMatchObject({ code: "42501" });
  });
});

describe("writeCompletion", () => {
  it("a tick is an insert that ignores a duplicate id, so a retry lands once", async () => {
    const { db, calls } = fakeDb();
    await writeCompletion({ op: "done", id: A, chore_id: C, day: "2026-11-24", person_id: P }, db);
    expect(calls).toHaveLength(1);
    expect(calls[0].ops[0][0]).toBe("upsert");
    expect(calls[0].ops[0][1][1]).toEqual({ onConflict: "id", ignoreDuplicates: true });
  });

  it("a void is a new row copying the tick it takes back", async () => {
    const { db, calls } = fakeDb((call) => (call.ops.some(([op]) => op === "select") && !call.ops.some(([op]) => op === "upsert") ? { data: [row(A)] } : {}));
    await writeCompletion({ op: "void", id: V, completion_id: A }, db);
    const insert = calls.find((c) => c.ops.some(([op]) => op === "upsert"))!;
    expect(insert.ops[0][1][0]).toEqual({ id: V, chore_id: C, day: "2026-11-24", person_id: P, voids: A });
  });

  it("voiding a tick that is gone, or a void, is not found; voiding one already voided is already done", async () => {
    await expect(writeCompletion({ op: "void", id: V, completion_id: A }, fakeDb(() => ({ data: [] })).db)).rejects.toBeInstanceOf(NotFound);
    await expect(writeCompletion({ op: "void", id: V, completion_id: B }, fakeDb(() => ({ data: [row(B, A)] })).db)).rejects.toBeInstanceOf(NotFound);
    const answer = (call: { ops: [string, unknown[]][] }) => (call.ops.some(([op]) => op === "upsert") ? { error: { code: "23505" } } : { data: [row(A)] });
    await expect(writeCompletion({ op: "void", id: V, completion_id: A }, fakeDb(answer).db)).resolves.toBeUndefined();
  });
});
