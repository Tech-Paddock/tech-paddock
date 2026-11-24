import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { memoryStore } from "./memoryStore";

const mem = vi.hoisted(() => ({ current: null as null | { store: unknown } }));
vi.mock("@/lib/calendar/store", async (orig) => ({
  ...(await orig<typeof import("@/lib/calendar/store")>()),
  supabaseStore: () => mem.current!.store,
}));

import { GET as week } from "@/app/api/calendar/week/route";
import { parseStart, toWeekEvent, weekEvents } from "@/lib/calendar/week";

const ENV = { ...process.env };
let m: ReturnType<typeof memoryStore>;
beforeEach(() => {
  m = memoryStore();
  mem.current = m;
  process.env.MS_CLIENT_ID = "cid";
  process.env.MS_CLIENT_SECRET = "sec";
});
afterEach(() => {
  process.env = { ...ENV };
  vi.unstubAllGlobals();
});

const D = "Mountain Standard Time";
// Invented events only.
const timed = (subject: string, s: string, e: string, extra: object = {}) => ({
  subject,
  isAllDay: false,
  isCancelled: false,
  start: { dateTime: `${s}:00.0000000`, timeZone: D },
  end: { dateTime: `${e}:00.0000000`, timeZone: D },
  ...extra,
});
const allDay = (subject: string, s: string, endExclusive: string) => ({
  subject,
  isAllDay: true,
  isCancelled: false,
  start: { dateTime: `${s}T00:00:00.0000000`, timeZone: D },
  end: { dateTime: `${endExclusive}T00:00:00.0000000`, timeZone: D },
});

type Views = Record<string, unknown[]>;
/** A Graph that is Microsoft: the token, the account's calendars, and each calendar's view. */
function stubGraph(calendars: { id: string; name: string }[], views: Views, over?: (url: string) => Response | undefined) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const o = over?.(url);
    if (o) return o;
    if (url.includes("/oauth2/")) return Response.json({ access_token: "access", refresh_token: "refresh-new" });
    if (url.includes("/calendarView")) {
      const id = decodeURIComponent(url.split("/me/calendars/")[1].split("/")[0]);
      return Response.json({ value: views[id] ?? [] });
    }
    if (url.includes("/me/calendars")) return Response.json({ value: calendars });
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", f);
  return { f, calls };
}

const get = (qs: string) => week(new Request(`https://grid.test/api/calendar/week${qs}`));
const CALS = [
  { id: "c-main", name: "Calendar" },
  { id: "c-pit", name: "Pit Row" },
];

describe("GET /api/calendar/week", () => {
  it("returns timed, all-day and repeated events from every calendar, sorted by start, titles only", async () => {
    const g = stubGraph(CALS, {
      "c-main": [
        timed("Dentist", "2026-11-24T14:00", "2026-11-24T15:00", { body: { content: "secret" }, attendees: [{ x: 1 }], location: { displayName: "Elm St" } }),
        allDay("Trip", "2026-11-26", "2026-11-29"), // Thu to Sat, Graph's end the day after
        // A weekly repeat, expanded by calendarView into its occurrences: two fall in the week.
        timed("Standup", "2026-11-23T09:30", "2026-11-23T10:00", { type: "occurrence" }),
        timed("Standup", "2026-11-30T09:30", "2026-11-30T10:00", { type: "occurrence" }),
      ],
      "c-pit": [allDay("Trash day", "2026-11-25", "2026-11-26"), timed("Late call", "2026-11-24T08:00", "2026-11-24T08:30")],
    });
    const res = await get("?start=2026-11-23");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      events: [
        { calendar: "Calendar", title: "Standup", start: "2026-11-23T09:30", end: "2026-11-23T10:00", all_day: false },
        { calendar: "Pit Row", title: "Late call", start: "2026-11-24T08:00", end: "2026-11-24T08:30", all_day: false },
        { calendar: "Calendar", title: "Dentist", start: "2026-11-24T14:00", end: "2026-11-24T15:00", all_day: false },
        { calendar: "Pit Row", title: "Trash day", start: "2026-11-25", end: "2026-11-25", all_day: true },
        { calendar: "Calendar", title: "Trip", start: "2026-11-26", end: "2026-11-28", all_day: true },
      ],
    });
    // Nothing but the five fields left.
    const text = JSON.stringify(await (await get("?start=2026-11-23")).json());
    expect(text).not.toMatch(/secret|attendees|Elm St/);
    // calendarView per calendar (not /events), Denver asked for, and only the fields it needs.
    const views = g.calls.filter((c) => c.url.includes("/calendarView"));
    expect(views).toHaveLength(4);
    expect(views[0].url).toContain("/me/calendars/c-main/calendarView?");
    expect(views[0].url).toContain("%24select=subject%2Cstart%2Cend%2CisAllDay%2CisCancelled");
    expect(views[0].headers.prefer).toBe(`outlook.timezone="${D}"`);
    expect(views[0].headers.authorization).toBe("Bearer access");
  });

  it("puts an all-day event before a timed one on the same day", async () => {
    stubGraph([CALS[0]], { "c-main": [timed("Lunch", "2026-11-25T12:00", "2026-11-25T13:00"), allDay("Holiday", "2026-11-25", "2026-11-26")] });
    const j = await (await get("?start=2026-11-23")).json();
    expect(j.events.map((e: { title: string }) => e.title)).toEqual(["Holiday", "Lunch"]);
  });

  it("drops cancelled occurrences and anything outside the seven days, keeps what spans in", async () => {
    stubGraph([CALS[0]], {
      "c-main": [
        timed("Cancelled", "2026-11-24T10:00", "2026-11-24T11:00", { isCancelled: true }),
        timed("Ends at midnight before", "2026-11-22T22:00", "2026-11-23T00:00"),
        timed("Starts after", "2026-11-30T00:00", "2026-11-30T01:00"),
        timed("Overnight", "2026-11-22T22:00", "2026-11-23T02:00"),
        allDay("Ended Sunday", "2026-11-21", "2026-11-23"),
        allDay("Long", "2026-11-20", "2026-12-05"),
        allDay("Starts after", "2026-11-30", "2026-12-01"),
      ],
    });
    const j = await (await get("?start=2026-11-23")).json();
    expect(j.events.map((e: { title: string }) => e.title).sort()).toEqual(["Long", "Overnight"]);
  });

  it("refreshes once, saves the new refresh token, and releases the lock", async () => {
    stubGraph(CALS, {});
    await get("?start=2026-11-23");
    expect(m.s.tokenSaves).toEqual(["refresh-new"]);
    expect(m.s.locked).toBe(false);
  });

  it("writes nothing else to the calendar schema", async () => {
    stubGraph(CALS, { "c-main": [timed("Dentist", "2026-11-24T14:00", "2026-11-24T15:00")] });
    await get("?start=2026-11-23");
    expect(m.s.outbox).toHaveLength(0);
    expect(m.s.calendars.size).toBe(0);
    expect(m.s.events.size).toBe(0);
  });

  it("follows Graph's paging to the end", async () => {
    const g = stubGraph(CALS.slice(0, 1), {}, (url) => {
      if (!url.includes("/calendarView")) return undefined;
      if (url.includes("page=2")) return Response.json({ value: [timed("Two", "2026-11-25T09:00", "2026-11-25T10:00")] });
      return Response.json({ value: [timed("One", "2026-11-24T09:00", "2026-11-24T10:00")], "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/calendars/c-main/calendarView?page=2" });
    });
    const j = await (await get("?start=2026-11-23")).json();
    expect(j.events.map((e: { title: string }) => e.title)).toEqual(["One", "Two"]);
    expect(g.calls.filter((c) => c.url.includes("/calendarView"))).toHaveLength(2);
  });

  it("answers an empty week as an empty list, which is a success", async () => {
    stubGraph(CALS, {});
    const res = await get("?start=2026-11-23");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, events: [] });
  });
});

describe("failures are never an empty list", () => {
  it("503 outlook not connected when there is no refresh token", async () => {
    m = memoryStore({ token: null });
    mem.current = m;
    const g = stubGraph(CALS, {});
    const res = await get("?start=2026-11-23");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "outlook not connected" });
    expect(g.f).not.toHaveBeenCalled();
  });

  it("503 outlook not connected when the Microsoft keys are missing", async () => {
    delete process.env.MS_CLIENT_ID;
    stubGraph(CALS, {});
    const res = await get("?start=2026-11-23");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "outlook not connected" });
  });

  it("503 busy, not an empty list, while a flush holds the lock; it leaves that lock alone", async () => {
    m = memoryStore({ locked: true });
    mem.current = m;
    const g = stubGraph(CALS, {});
    const res = await get("?start=2026-11-23");
    expect(res.status).toBe(503);
    expect((await res.json()).events).toBeUndefined();
    expect(g.f).not.toHaveBeenCalled();
    expect(m.s.locked).toBe(true);
  });

  it("502 naming Microsoft when Graph fails on a view, with its code but never its message", async () => {
    stubGraph(CALS, {}, (url) =>
      url.includes("/calendarView") ? Response.json({ error: { code: "ErrorServerBusy", message: "Dentist at 2pm" } }, { status: 503 }) : undefined,
    );
    const res = await get("?start=2026-11-23");
    expect(res.status).toBe(502);
    const j = await res.json();
    expect(j).toEqual({ ok: false, error: "microsoft failed: graph 503 ErrorServerBusy" });
    expect(JSON.stringify(j)).not.toContain("Dentist");
    expect(m.s.locked).toBe(false);
  });

  it("502 when the token refresh is refused (the connection is dead)", async () => {
    stubGraph(CALS, {}, (url) => (url.includes("/oauth2/") ? Response.json({ error: "invalid_grant" }, { status: 400 }) : undefined));
    const res = await get("?start=2026-11-23");
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/^microsoft failed/i);
  });

  it("502 when Microsoft cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("boom"))));
    const res = await get("?start=2026-11-23");
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("microsoft failed: graph 0 unreachable");
  });

  it("502 rather than a wrong time when Graph answers in another time zone", async () => {
    stubGraph(CALS.slice(0, 1), {
      "c-main": [{ ...timed("Dentist", "2026-11-24T14:00", "2026-11-24T15:00"), start: { dateTime: "2026-11-24T21:00:00.0000000", timeZone: "UTC" } }],
    });
    const res = await get("?start=2026-11-23");
    expect(res.status).toBe(502);
  });

  it("500 when the calendar database is unreachable", async () => {
    m.store.getRefreshToken = async () => {
      throw new Error("db");
    };
    stubGraph(CALS, {});
    const res = await get("?start=2026-11-23");
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
  });
});

describe("start", () => {
  it.each([
    ["", "start is required"],
    ["?start=", "start is required"],
    ["?start=tomorrow", "start must be"],
    ["?start=2026-11-31", "start must be"],
    ["?start=2026-11-23T09:00", "start must be"],
    ["?start=11/23/2026", "start must be"],
  ])("400 for %j, naming the field and never repeating the value", async (qs, msg) => {
    const g = stubGraph(CALS, {});
    const res = await get(qs);
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.ok).toBe(false);
    expect(j.error).toContain(msg);
    if (qs.includes("tomorrow")) expect(j.error).not.toContain("tomorrow");
    expect(g.f).not.toHaveBeenCalled();
  });

  it("accepts any real day, a leap day included", () => {
    expect(parseStart("2028-02-29")).toBe("2028-02-29");
    expect(() => parseStart("2027-02-29")).toThrow();
  });
});

describe("the mapping", () => {
  it("keeps Graph's wall-clock to the minute, accepting either Denver zone name", () => {
    const v = timed("A", "2026-11-24T14:05", "2026-11-24T15:00");
    expect(toWeekEvent("X", v, "2026-11-23")).toEqual({ calendar: "X", title: "A", start: "2026-11-24T14:05", end: "2026-11-24T15:00", all_day: false });
    const d = { ...v, start: { ...v.start, timeZone: "America/Denver" }, end: { ...v.end, timeZone: "America/Denver" } };
    expect(toWeekEvent("X", d, "2026-11-23")).not.toBeNull();
  });

  it("gives an event with no subject an empty title", () => {
    expect(toWeekEvent("X", { ...timed("", "2026-11-24T14:00", "2026-11-24T15:00"), subject: null }, "2026-11-23")?.title).toBe("");
  });

  it("is the same across the daylight-saving change: no conversion is done here", () => {
    // Sun 8 Nov 2026 is the fall-back day; wall-clock in, wall-clock out.
    const e = toWeekEvent("X", timed("A", "2026-11-08T01:30", "2026-11-08T02:30"), "2026-11-02");
    expect(e?.start).toBe("2026-11-08T01:30");
  });
});

describe("rules", () => {
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  it("the route exports GET only and never writes: no outbox, no events, no calendar ids", () => {
    const route = read("app/api/calendar/week/route.ts");
    expect(route).toMatch(/export async function GET/);
    expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    const week = read("lib/calendar/week.ts");
    expect(week).not.toMatch(/\.(append|markSent|markError|saveCalendarId|saveEventId|dropCalendarId|dropEventId)\(/);
    expect(week).not.toMatch(/console\./);
  });
  it("asks Graph for no field beyond the title and times", () => {
    expect(read("lib/calendar/graph.ts")).toContain('$select: "subject,start,end,isAllDay,isCancelled"');
  });
  it("calls weekEvents directly too", async () => {
    stubGraph(CALS, {});
    expect(await weekEvents({ store: m.store }, "2026-11-23")).toEqual({ ok: true, events: [] });
  });
});
