import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  week: null as unknown,
  weekError: false,
  sent: [] as unknown[],
  sendOk: false,
  chore: null as unknown,
}));

vi.mock("@/lib/db", async (orig) => {
  const real = await orig<typeof import("@/lib/db")>();
  return {
    ...real,
    readWeek: async () => {
      if (state.weekError) throw new real.DbError("42501");
      return state.week;
    },
    writeChore: async () => {},
    readChoreForCalendar: async () => state.chore,
  };
});
vi.mock("@/lib/calendar-client", async (orig) => {
  const real = await orig<typeof import("@/lib/calendar-client")>();
  return {
    ...real,
    sendCalendarEvent: async (_r: unknown, event: unknown) => {
      state.sent.push(event);
      return { ok: state.sendOk };
    },
  };
});

import { GET } from "@/app/api/week/route";
import { POST } from "@/app/api/chores/route";

const CALENDAR = "https://grid.techpaddock.io/api/calendar/week?start=2026-11-22";
const ID = "11111111-1111-4111-8111-111111111111";

function weekRequest(path = "/api/week?start=2026-11-22") {
  return new Request(`https://example.test${path}`, { headers: { cookie: "paddock_session=abc" } });
}

beforeEach(() => {
  state.week = { people: [], chores: [], completions: [] };
  state.weekError = false;
  state.sent = [];
  state.sendOk = false;
  state.chore = null;
  vi.unstubAllGlobals();
});

describe("GET /api/week", () => {
  it("a failed calendar read comes back as failed, with the chores intact, never as an empty week", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    const res = await GET(weekRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toEqual({ ok: false, error: "not_connected" });
    expect(body.chores).toEqual([]);
  });

  it("an answered calendar passes its events through, asked for the week's Sunday", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, events: [] }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const body = await (await GET(weekRequest())).json();
    expect(body.events).toEqual({ ok: true, events: [] });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe(CALENDAR);
  });

  it("a database failure is a 500, and a bad start a 400", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    state.weekError = true;
    expect((await GET(weekRequest())).status).toBe(500);
    expect((await GET(weekRequest("/api/week?start=soon"))).status).toBe(400);
    expect((await GET(weekRequest("/api/week"))).status).toBe(400);
  });
});

describe("POST /api/chores", () => {
  const add = (extra = {}) =>
    new Request("https://example.test/api/chores", {
      method: "POST",
      headers: { cookie: "paddock_session=abc", "content-type": "application/json" },
      body: JSON.stringify({ op: "add", id: ID, title: "Bins", cadence: "daily", start_on: "2026-11-24", ...extra }),
    });

  it("a save sends the chore to the calendar, and a calendar that fails never fails the save", async () => {
    state.chore = { id: ID, title: "Bins", cadence: "daily", weekdays: null, every_n: null, start_on: "2026-11-24", archived_at: null };
    state.sendOk = false;
    const res = await POST(add());
    expect(res.status).toBe(200);
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0]).toMatchObject({ app: "pit-row", source_id: ID, op: "upsert" });
  });

  it("a retried add of a chore already retired does not bring its event back", async () => {
    state.chore = { id: ID, title: "Bins", cadence: "daily", weekdays: null, every_n: null, start_on: "2026-11-24", archived_at: "2026-11-25T00:00:00Z" };
    expect((await POST(add())).status).toBe(200);
    expect(state.sent).toEqual([]);
  });

  it("retiring sends a delete", async () => {
    const res = await POST(
      new Request("https://example.test/api/chores", {
        method: "POST",
        headers: { cookie: "paddock_session=abc", "content-type": "application/json" },
        body: JSON.stringify({ op: "retire", id: ID }),
      }),
    );
    expect(res.status).toBe(200);
    expect(state.sent).toEqual([{ app: "pit-row", source_id: ID, op: "delete" }]);
  });
});
