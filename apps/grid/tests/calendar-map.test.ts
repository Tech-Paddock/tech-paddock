import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  sent: [] as unknown[],
  ok: true,
  throwSend: false,
  tasks: new Map<string, unknown>(),
  routines: new Map<string, unknown>(),
  writes: [] as unknown[],
  failWrite: false,
  sources: { routines: [] as unknown[], tasks: [] as unknown[] },
}));

vi.mock("@/lib/calendar-client", () => ({
  sendCalendarEvent: async (_req: unknown, event: unknown) => {
    if (h.throwSend) throw new Error("boom");
    h.sent.push(event);
    return { ok: h.ok };
  },
}));
vi.mock("@/lib/db", async (orig) => ({
  ...(await orig<typeof import("@/lib/db")>()),
  writeTask: async (o: unknown) => {
    if (h.failWrite) throw new Error("db");
    h.writes.push(o);
  },
  writeRoutine: async (o: unknown) => {
    if (h.failWrite) throw new Error("db");
    h.writes.push(o);
  },
  readTask: async (id: string) => h.tasks.get(id) ?? null,
  readRoutineForCalendar: async (id: string) => h.routines.get(id) ?? null,
  readCalendarSources: async () => h.sources,
}));

import { POST as backfill } from "@/app/api/backfill/calendar/route";
import { POST as routinesRoute } from "@/app/api/routines/route";
import { POST as tasksRoute } from "@/app/api/tasks/route";
import { denverToday, routineEvent, taskEvent } from "@/lib/calendar-map";

const ID = "11111111-1111-4111-8111-111111111111";
const post = (url: string, body: unknown) => new Request(`https://grid.test${url}`, { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  h.sent = [];
  h.ok = true;
  h.throwSend = false;
  h.failWrite = false;
  h.writes = [];
  h.tasks.clear();
  h.routines.clear();
  h.sources = { routines: [], tasks: [] };
});

describe("the mapping", () => {
  it("a routine is an all-day weekly event on its weekdays, starting on one of them", () => {
    // 2026-11-17 is a Tuesday (2); the routine runs Thursday and Saturday.
    const e = routineEvent({ id: ID, name: "Stretch", weekdays: [6, 4] }, "2026-11-17");
    expect(e).toEqual({
      app: "grid",
      source_id: ID,
      op: "upsert",
      title: "Stretch",
      start: "2026-11-19",
      all_day: true,
      recurrence: { freq: "weekly", days_of_week: ["thursday", "saturday"] },
    });
  });

  it("a routine that runs today starts today", () => {
    expect(routineEvent({ id: ID, name: "x", weekdays: [2] }, "2026-11-17")).toMatchObject({ start: "2026-11-17" });
  });

  it("a dated open task is an all-day event; done or undated is a delete", () => {
    expect(taskEvent({ id: ID, title: "Pay", due_on: "2026-12-01", done_on: null })).toEqual({
      app: "grid",
      source_id: ID,
      op: "upsert",
      title: "Pay",
      start: "2026-12-01",
      all_day: true,
    });
    expect(taskEvent({ id: ID, title: "Pay", due_on: "2026-12-01", done_on: "2026-11-17" })).toEqual({ app: "grid", source_id: ID, op: "delete" });
    expect(taskEvent({ id: ID, title: "Pay", due_on: null, done_on: null })).toEqual({ app: "grid", source_id: ID, op: "delete" });
  });

  it("works out the Denver day, not UTC's", () => {
    // 03:00 UTC on the 18th is still the evening of the 17th in Denver.
    expect(denverToday(new Date("2026-11-18T03:00:00Z"))).toBe("2026-11-17");
  });
});

describe("POST /api/tasks", () => {
  it("sends a dated new task, reading the row back", async () => {
    h.tasks.set(ID, { id: ID, title: "Pay", due_on: "2026-12-01", done_on: null });
    const res = await tasksRoute(post("/api/tasks", { op: "add", id: ID, title: "Pay", due_on: "2026-12-01" }));
    expect(res.status).toBe(200);
    expect(h.sent).toEqual([expect.objectContaining({ op: "upsert", source_id: ID, start: "2026-12-01" })]);
  });

  it("sends nothing for a task with no date", async () => {
    await tasksRoute(post("/api/tasks", { op: "add", id: ID, title: "Pay", due_on: null }));
    expect(h.sent).toEqual([]);
  });

  it("ticking done deletes the event and unticking brings it back", async () => {
    h.tasks.set(ID, { id: ID, title: "Pay", due_on: "2026-12-01", done_on: "2026-11-17" });
    await tasksRoute(post("/api/tasks", { op: "done", id: ID, done: true, day: "2026-11-17" }));
    h.tasks.set(ID, { id: ID, title: "Pay", due_on: "2026-12-01", done_on: null });
    await tasksRoute(post("/api/tasks", { op: "done", id: ID, done: false, day: "2026-11-17" }));
    expect(h.sent).toEqual([expect.objectContaining({ op: "delete" }), expect.objectContaining({ op: "upsert" })]);
  });

  it("changing the date updates the event and clearing it deletes", async () => {
    h.tasks.set(ID, { id: ID, title: "Pay", due_on: "2026-12-05", done_on: null });
    await tasksRoute(post("/api/tasks", { op: "due", id: ID, due_on: "2026-12-05" }));
    h.tasks.set(ID, { id: ID, title: "Pay", due_on: null, done_on: null });
    await tasksRoute(post("/api/tasks", { op: "due", id: ID, due_on: null }));
    expect(h.sent).toEqual([expect.objectContaining({ op: "upsert", start: "2026-12-05" }), expect.objectContaining({ op: "delete" })]);
  });

  it("a calendar failure, or a throw, never fails the save", async () => {
    h.tasks.set(ID, { id: ID, title: "Pay", due_on: "2026-12-01", done_on: null });
    h.ok = false;
    expect((await tasksRoute(post("/api/tasks", { op: "due", id: ID, due_on: "2026-12-01" }))).status).toBe(200);
    h.throwSend = true;
    expect((await tasksRoute(post("/api/tasks", { op: "due", id: ID, due_on: "2026-12-01" }))).status).toBe(200);
  });

  it("a failed write sends nothing", async () => {
    h.failWrite = true;
    const res = await tasksRoute(post("/api/tasks", { op: "add", id: ID, title: "Pay", due_on: "2026-12-01" }));
    expect(res.status).toBe(500);
    expect(h.sent).toEqual([]);
  });
});

describe("POST /api/routines", () => {
  it("sends a new routine as a repeating event", async () => {
    h.routines.set(ID, { id: ID, name: "Stretch", weekdays: [1, 3], archived_at: null });
    await routinesRoute(post("/api/routines", { op: "add", id: ID, name: "Stretch", weekdays: [1, 3] }));
    expect(h.sent).toEqual([expect.objectContaining({ op: "upsert", source_id: ID, recurrence: { freq: "weekly", days_of_week: ["monday", "wednesday"] } })]);
  });

  it("does not bring back the event of a routine already retired", async () => {
    h.routines.set(ID, { id: ID, name: "Stretch", weekdays: [1], archived_at: "2026-11-17T00:00:00Z" });
    await routinesRoute(post("/api/routines", { op: "add", id: ID, name: "Stretch", weekdays: [1] }));
    expect(h.sent).toEqual([]);
  });

  it("retiring deletes the event, and a tick sends nothing", async () => {
    await routinesRoute(post("/api/routines", { op: "archive", id: ID }));
    await routinesRoute(post("/api/routines", { op: "tick", routine_id: ID, day: "2026-11-17", ticked: true }));
    expect(h.sent).toEqual([{ app: "grid", source_id: ID, op: "delete" }]);
  });
});

describe("POST /api/backfill/calendar", () => {
  it("sends every routine and open dated task once and counts them", async () => {
    h.sources = {
      routines: [{ id: ID, name: "Stretch", weekdays: [1] }],
      tasks: [{ id: "22222222-2222-4222-8222-222222222222", title: "Pay", due_on: "2026-12-01", done_on: null }],
    };
    const res = await backfill(post("/api/backfill/calendar", {}));
    expect(await res.json()).toEqual({ ok: true, routines: 1, tasks: 1, sent: 2, failed: 0 });
    expect(h.sent).toHaveLength(2);
  });

  it("counts a failed send and never repeats a title", async () => {
    h.ok = false;
    h.sources = { routines: [{ id: ID, name: "Secret words", weekdays: [1] }], tasks: [] };
    const body = JSON.stringify(await (await backfill(post("/api/backfill/calendar", {}))).json());
    expect(body).toContain('"failed":1');
    expect(body).not.toContain("Secret");
  });
});
