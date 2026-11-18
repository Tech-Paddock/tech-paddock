// #67: what Lando sends to the household Outlook calendar (the contract is Grid's), and that a calendar failure
// never fails a save.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "@/lib/calendar-client";
import type { JournalEvent } from "@/lib/events";
import type { Upcoming } from "@/lib/upcoming";
import {
  addMinutes,
  backfillEvents,
  entryEvent,
  eventsAfterEntry,
  eventsAfterPlan,
  planEvent,
  pushAfterSave,
  pushEvents,
} from "@/lib/outlook";

const ID = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;

function ev(n: number, kind: JournalEvent["kind"], at: string, details: Record<string, unknown>, extra: Partial<JournalEvent> = {}): JournalEvent {
  return { id: ID(n), kind, at, person_id: null, details, note: null, voids: null, created_at: at, ...extra };
}

function plan(n: number, extra: Partial<Upcoming> = {}): Upcoming {
  return {
    id: ID(n),
    kind: "vet",
    title: "Vet visit · Check-up",
    due_on: "2026-12-01",
    due_time: "09:30",
    note: "a private note",
    repeat_every: null,
    repeat_unit: null,
    status: "open",
    done_on: null,
    done_event: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    ...extra,
  };
}

const req = { headers: { get: (k: string) => (k === "cookie" ? "paddock_session=abc" : null) } };

describe("a plan's event", () => {
  it("is a timed event in the Lando calendar, with a plain title and no notes", () => {
    const e = planEvent(plan(1)) as Extract<CalendarEvent, { op: "upsert" }>;
    expect(e).toEqual({ app: "lando", source_id: ID(1), op: "upsert", title: "Lando: Vet visit, Check-up", start: "2026-12-01T09:30" });
    expect(e.notes).toBeUndefined();
    expect(JSON.stringify(e)).not.toContain("private");
  });
  it("is all-day when the plan has no time", () => {
    expect(planEvent(plan(2, { due_time: null, title: "Training", kind: "other" }))).toEqual({
      app: "lando",
      source_id: ID(2),
      op: "upsert",
      title: "Lando: Training",
      start: "2026-12-01",
      all_day: true,
    });
  });
  it("takes HH:MM from a time that came back as HH:MM:SS", () => {
    expect((planEvent(plan(3, { due_time: "07:05:00" })) as { start: string }).start).toBe("2026-12-01T07:05");
  });
  it("is a real recurring event for a repeat: weekly, monthly and yearly, every n", () => {
    const r = (unit: "week" | "month" | "year", every: number) => (planEvent(plan(4, { repeat_unit: unit, repeat_every: every })) as { recurrence?: unknown }).recurrence;
    expect(r("week", 1)).toEqual({ freq: "weekly", interval: 1 });
    expect(r("month", 3)).toEqual({ freq: "monthly", interval: 3 });
    expect(r("year", 1)).toEqual({ freq: "yearly", interval: 1 });
  });
  it("keeps a title to the contract's 200 characters", () => {
    expect((planEvent(plan(5, { title: "x".repeat(300) })) as { title: string }).title.length).toBe(200);
  });
});

describe("what a saved plan action sends", () => {
  const item = plan(6);
  it("add and edit upsert the plan", () => {
    const input = { kind: "vet", title: "x", due_on: "2026-12-01", due_time: null, note: null, repeat_every: null, repeat_unit: null } as const;
    expect(eventsAfterPlan({ action: "add", item: input }, { item, next: null })).toEqual([planEvent(item)]);
    expect(eventsAfterPlan({ action: "edit", id: item.id, item: input }, { item, next: null })).toEqual([planEvent(item)]);
  });
  it("cancel removes its event", () => {
    expect(eventsAfterPlan({ action: "cancel", id: item.id }, { item: { ...item, status: "cancelled" }, next: null })).toEqual([
      { app: "lando", source_id: item.id, op: "delete" },
    ]);
  });
  it("Done removes its event and, for a repeat, sends the next plan as its own recurring event", () => {
    const rep = plan(7, { repeat_every: 1, repeat_unit: "month" });
    const next = plan(8, { repeat_every: 1, repeat_unit: "month", due_on: "2027-01-01" });
    const out = eventsAfterPlan({ action: "done", id: rep.id, done_on: "2026-12-01", done_event: null }, { item: { ...rep, status: "done" }, next });
    expect(out.map((e) => [e.op, e.source_id])).toEqual([
      ["delete", ID(7)],
      ["upsert", ID(8)],
    ]);
    expect((out[1] as { start: string }).start).toBe("2027-01-01T09:30");
  });
});

describe("a log entry's event", () => {
  it("is in the Lando log calendar at the Denver wall-clock time, never UTC", () => {
    // 2026-11-17T21:12Z is 14:12 MST (UTC-7).
    const e = entryEvent(ev(1, "food", "2026-11-17T21:12:00.000Z", { type: "meal", item_name: "Kibble", amount: 1, unit: "serving" }));
    expect(e).toMatchObject({ app: "lando-log", source_id: ID(1), op: "upsert", start: "2026-11-17T14:12", end: "2026-11-17T14:27" });
    expect((e as { title: string }).title).toBe("Lando: Meal, Kibble, 1 serving");
    expect(JSON.stringify(e)).not.toMatch(/Z"|[+-]0[67]:00/);
  });
  it("follows daylight time", () => {
    // 2026-07-01T21:12Z is 15:12 MDT (UTC-6).
    expect(entryEvent(ev(2, "potty", "2026-07-01T21:12:00.000Z", { what: "pee", where: "outside" }))).toMatchObject({ start: "2026-07-01T15:12" });
  });
  it("lasts as long as a walk or a potty trip outside says", () => {
    const walk = entryEvent(ev(3, "exercise", "2026-11-17T21:00:00.000Z", { type: "walk", minutes: 45, where: "outside" }));
    expect(walk).toMatchObject({ start: "2026-11-17T14:00", end: "2026-11-17T14:45" });
    const potty = entryEvent(ev(4, "potty", "2026-11-17T21:00:00.000Z", { what: "pee", where: "outside", minutes: 5 }));
    expect(potty).toMatchObject({ end: "2026-11-17T14:05" });
  });
  it("crosses midnight in wall-clock", () => {
    expect(addMinutes("2026-11-17T23:50", 30)).toBe("2026-11-18T00:20");
  });
  it("is all-day for a weight", () => {
    const e = entryEvent(ev(5, "weight", "2026-11-17T19:00:00.000Z", { value: 7.6, unit: "lb" }));
    expect(e).toMatchObject({ app: "lando-log", start: "2026-11-17", all_day: true });
    expect((e as { end?: string }).end).toBeUndefined();
  });
  it("is never sent for a note or a void", () => {
    expect(entryEvent(ev(6, "note", "2026-11-17T19:00:00.000Z", { text: "private words" }))).toBeNull();
    expect(entryEvent(ev(7, "void", "2026-11-17T19:00:00.000Z", {}, { voids: ID(1) }))).toBeNull();
  });
  it("names no person and carries no notes", () => {
    const e = entryEvent(ev(8, "food", "2026-11-17T21:12:00.000Z", { type: "meal", item_name: "Kibble", amount: 1, unit: "serving" }, { note: "secret", person_id: ID(99) }));
    expect(JSON.stringify(e)).not.toMatch(/secret|notes|bbbb/);
  });
});

describe("what a saved journal write sends", () => {
  const food = { type: "meal", item_name: "Kibble", amount: 1, unit: "serving" };
  it("a new entry sends its event", () => {
    expect(eventsAfterEntry(ev(1, "food", "2026-11-17T21:12:00.000Z", food)).map((e) => [e.app, e.op, e.source_id])).toEqual([["lando-log", "upsert", ID(1)]]);
  });
  it("a correction removes the old entry's event and sends the new one", () => {
    const out = eventsAfterEntry(ev(2, "food", "2026-11-17T21:12:00.000Z", food, { voids: ID(1) }));
    expect(out.map((e) => [e.op, e.source_id])).toEqual([
      ["delete", ID(1)],
      ["upsert", ID(2)],
    ]);
  });
  it("a delete only removes", () => {
    expect(eventsAfterEntry(ev(3, "void", "2026-11-17T21:12:00.000Z", {}, { voids: ID(1) }))).toEqual([{ app: "lando-log", source_id: ID(1), op: "delete" }]);
  });
  it("a note sends nothing", () => {
    expect(eventsAfterEntry(ev(4, "note", "2026-11-17T21:12:00.000Z", { text: "x" }))).toEqual([]);
  });
});

describe("the backfill", () => {
  const now = new Date("2026-11-17T20:00:00.000Z");
  it("sends every open plan and repeat, and the live entries of the last 30 days, never a note, a void or a corrected one", () => {
    const food = { type: "meal", item_name: "Kibble", amount: 1, unit: "serving" };
    const journal = [
      ev(1, "food", "2026-11-16T20:00:00.000Z", food), // live
      ev(2, "food", "2026-11-15T20:00:00.000Z", food), // corrected by 3
      ev(3, "food", "2026-11-15T20:05:00.000Z", food, { voids: ID(2) }),
      ev(4, "food", "2026-10-01T20:00:00.000Z", food), // too old
      ev(5, "note", "2026-11-16T20:00:00.000Z", { text: "x" }),
      ev(6, "weight", "2026-09-01T19:00:00.000Z", { value: 5, unit: "lb" }), // an old weight, read for the chart
      ev(7, "food", "2026-11-14T20:00:00.000Z", food),
      ev(8, "void", "2026-11-14T21:00:00.000Z", {}, { voids: ID(7) }),
    ];
    const plans = [plan(10), plan(11, { repeat_every: 1, repeat_unit: "week" }), plan(12, { status: "done" })];
    const out = backfillEvents(plans, journal, now);
    expect(out.map((e) => `${e.app}:${e.source_id}`)).toEqual([`lando:${ID(10)}`, `lando:${ID(11)}`, `lando-log:${ID(1)}`, `lando-log:${ID(3)}`]);
    expect(out.every((e) => e.op === "upsert")).toBe(true);
  });
});

describe("a calendar failure never fails a save", () => {
  it("pushEvents sends in order, counts what was taken, and never throws", async () => {
    const seen: string[] = [];
    const send = vi.fn(async (_r: unknown, e: CalendarEvent) => {
      seen.push(e.source_id);
      if (e.source_id === "b") throw new Error("down");
      return { ok: e.source_id !== "c" };
    });
    const events = ["a", "b", "c", "d"].map((s) => ({ app: "lando", source_id: s, op: "delete" }) as CalendarEvent);
    expect(await pushEvents(req, events, send)).toBe(2);
    expect(seen).toEqual(["a", "b", "c", "d"]);
  });
  it("pushAfterSave swallows a builder that throws and a send that throws", async () => {
    await expect(pushAfterSave(req, () => { throw new Error("bad"); })).resolves.toBeUndefined();
    const send = vi.fn(async () => { throw new Error("down"); });
    await expect(pushAfterSave(req, () => [{ app: "lando", source_id: "a", op: "delete" }], send)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("the routes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.doUnmock("@/lib/journal");
    vi.doUnmock("@/lib/upcoming-db");
  });

  async function post(path: "events" | "upcoming", body: unknown, fetchImpl: (url: string, init: RequestInit) => Promise<Response>) {
    vi.stubGlobal("fetch", fetchImpl);
    const { NextRequest } = await import("next/server");
    const route = await import(`@/app/api/${path}/route`);
    return route.POST(new NextRequest(`https://lando.techpaddock.io/api/${path}`, { method: "POST", headers: { cookie: "paddock_session=abc" }, body: JSON.stringify(body) }));
  }

  it("a saved entry goes to the log calendar, and the save answers 200 even when Grid is down", async () => {
    const saved = ev(1, "food", "2026-11-17T21:12:00.000Z", { type: "meal", item_name: "Kibble", amount: 1, unit: "serving" });
    vi.doMock("@/lib/supabase", () => ({ getServiceClient: () => ({}) }));
    vi.doMock("@/lib/journal", async (orig) => ({ ...(await orig<typeof import("@/lib/journal")>()), writeEvent: async () => saved }));
    const calls: { url: string; body: Record<string, unknown>; cookie: string }[] = [];
    const ok = await post("events", {}, async (url, init) => {
      calls.push({ url, body: JSON.parse(String(init.body)), cookie: String((init.headers as Record<string, string>).cookie) });
      return new Response("{}", { status: 200 });
    });
    expect(ok.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "https://grid.techpaddock.io/api/calendar/events", cookie: "paddock_session=abc" });
    expect(calls[0].body).toMatchObject({ app: "lando-log", source_id: ID(1), op: "upsert" });

    const down = await post("events", {}, async () => {
      throw new Error("Grid is down");
    });
    expect(down.status).toBe(200);
    expect(((await down.json()) as { event: { id: string } }).event.id).toBe(ID(1));
  });

  it("a failed write sends nothing", async () => {
    vi.doMock("@/lib/supabase", () => ({ getServiceClient: () => ({}) }));
    vi.doMock("@/lib/journal", async (orig) => ({
      ...(await orig<typeof import("@/lib/journal")>()),
      writeEvent: async () => {
        throw new Error("db down");
      },
    }));
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const res = await post("events", {}, fetchImpl);
    expect(res.status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a saved plan goes to the Lando calendar", async () => {
    const item = plan(1, { repeat_every: 1, repeat_unit: "week" });
    vi.doMock("@/lib/supabase", () => ({ getServiceClient: () => ({}) }));
    vi.doMock("@/lib/upcoming-db", async (orig) => ({ ...(await orig<typeof import("@/lib/upcoming-db")>()), applyAction: async () => ({ item, next: null }) }));
    const bodies: Record<string, unknown>[] = [];
    const res = await post(
      "upcoming",
      { action: "add", item: { kind: "vet", title: "Vet visit · Check-up", due_on: "2026-12-01", due_time: "09:30", note: null, repeat_every: 1, repeat_unit: "week" } },
      async (_u, init) => {
        bodies.push(JSON.parse(String(init.body)));
        return new Response("{}", { status: 200 });
      }
    );
    expect(res.status).toBe(200);
    expect(bodies).toEqual([planEvent(item)]);
  });
});

describe("the Calendar tab is gone", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
  it("has no tab, panel or link, and no Calendar component", () => {
    const journal = read("app/Journal.tsx");
    expect(journal).not.toMatch(/tab-calendar|panel-calendar|showTab\("calendar"\)|from "\.\/Calendar"/);
    expect(() => read("app/Calendar.tsx")).toThrow();
    expect(() => read("lib/calendar.ts")).toThrow();
  });
  it("the backfill route is under the gate, which opens only cron and version signed out", () => {
    expect(read("app/api/calendar/backfill/route.ts")).toContain("sendCalendarEvent");
  });
});
