import { describe, expect, it } from "vitest";
import { DbError, NotFound, readToday, writeGoal, writeJournal, writeMeditation, writeRoutine, writeTask } from "@/lib/db";
import { fakeDb, has, type Call } from "./fakeDb";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
// 2026-11-16 is a Monday: weekday 1.
const DAY = "2026-11-16";

describe("reading a day", () => {
  function answer(call: Call) {
    switch (call.table) {
      case "tasks":
        return { data: [{ id: A, title: "Sample task", due_on: null, done_on: null }] };
      case "routines":
        return {
          data: [
            { id: A, name: "Mondays", weekdays: [1] },
            { id: B, name: "Weekends", weekdays: [0, 6] },
          ],
        };
      case "routine_ticks":
        return { data: [{ routine_id: A }] };
      case "journal_versions":
        return {
          data: [
            { id: A, entry_id: C, body: "first words", created_at: "2026-11-16T08:00:00Z" },
            { id: B, entry_id: C, body: "first words, again", created_at: "2026-11-16T09:00:00Z" },
          ],
        };
      case "meditation_sessions":
        return has(call, "eq", "finished", true)
          ? { data: [{ day: "2026-11-16" }, { day: "2026-11-15" }, { day: "2026-11-13" }] }
          : { data: [{ id: A, planned_seconds: 300, elapsed_seconds: 300, finished: true }] };
      default:
        return { data: [] };
    }
  }

  it("keeps only the routines that repeat on that weekday, with their tick", async () => {
    const { db } = fakeDb(answer);
    const today = await readToday(DAY, db);
    expect(today.routines).toEqual([{ id: A, name: "Mondays", weekdays: [1], ticked: true }]);
  });

  it("groups journal versions into entries, oldest version first", async () => {
    const { db } = fakeDb(answer);
    const today = await readToday(DAY, db);
    expect(today.journal).toHaveLength(1);
    expect(today.journal[0].entry_id).toBe(C);
    expect(today.journal[0].versions.map((v) => v.body)).toEqual(["first words", "first words, again"]);
  });

  it("counts the streak from finished days and returns today's sittings", async () => {
    const { db } = fakeDb(answer);
    const today = await readToday(DAY, db);
    expect(today.meditation.streak).toBe(2);
    expect(today.meditation.sessions).toHaveLength(1);
  });

  it("reads open tasks and the ones done on that day", async () => {
    const { db, calls } = fakeDb(answer);
    await readToday(DAY, db);
    const tasks = calls.find((c) => c.table === "tasks")!;
    expect(has(tasks, "or", `done_on.is.null,done_on.eq.${DAY}`)).toBe(true);
  });

  it("fails with the error's code only, never its message", async () => {
    const { db } = fakeDb((c) => (c.table === "goals" ? {} : { error: { code: "42501", message: "row (typed words) refused" } }));
    const err = await readToday(DAY, db).catch((e) => e);
    expect(err).toBeInstanceOf(DbError);
    expect(err.code).toBe("42501");
    expect(err.message).not.toContain("typed words");
  });
});

describe("writing", () => {
  it("creates on the browser's id and ignores a repeat (a retried save lands once)", async () => {
    const { db, calls } = fakeDb();
    await writeTask({ op: "add", id: A, title: "Sample", due_on: null }, db);
    await writeRoutine({ op: "add", id: A, name: "Sample", weekdays: [1] }, db);
    await writeGoal({ op: "add", id: A, title: "Sample" }, db);
    await writeMeditation({ op: "log", id: A, day: DAY, planned_seconds: 60, elapsed_seconds: 60, finished: true }, db);
    for (const c of calls) {
      expect(has(c, "upsert"), c.table).toBe(true);
      expect(c.ops.find(([n]) => n === "upsert")![1][1]).toEqual({ onConflict: "id", ignoreDuplicates: true });
    }
  });

  it("a journal save only ever inserts a version, never updates or deletes", async () => {
    const { db, calls } = fakeDb();
    await writeJournal({ op: "save", id: A, entry_id: B, day: DAY, body: "invented words" }, db);
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("journal_versions");
    const names = calls[0].ops.map(([n]) => n);
    expect(names).toEqual(["upsert"]);
    expect(calls[0].ops[0][1][1]).toEqual({ onConflict: "id", ignoreDuplicates: true });
  });

  it("a tick off deletes that routine's tick for that day only", async () => {
    const { db, calls } = fakeDb();
    await writeRoutine({ op: "tick", routine_id: A, day: DAY, ticked: false }, db);
    expect(calls[0].table).toBe("routine_ticks");
    expect(has(calls[0], "delete")).toBe(true);
    expect(has(calls[0], "eq", "routine_id", A)).toBe(true);
    expect(has(calls[0], "eq", "day", DAY)).toBe(true);
  });

  it("a change to something that does not exist is a 404, not a quiet success", async () => {
    const { db } = fakeDb(() => ({ data: [] }));
    await expect(writeTask({ op: "done", id: A, done: true, day: DAY }, db)).rejects.toBeInstanceOf(NotFound);
  });

  it("a refused write throws, so the browser keeps the tap", async () => {
    const { db } = fakeDb(() => ({ error: { code: "500" } }));
    await expect(writeTask({ op: "add", id: A, title: "x", due_on: null }, db)).rejects.toBeInstanceOf(DbError);
  });
});
