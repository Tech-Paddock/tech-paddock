import { describe, expect, it } from "vitest";
import { DENVER, GraphError, calendarName, deleteEvent, refreshTokens, toGraphEvent, toGraphRecurrence, updateEvent, authorizeUrl } from "@/lib/calendar/graph";
import { parseCalendarEvent, type Upsert } from "@/lib/calendar/validate";
import { fakeGraph } from "./memoryStore";

const up = (extra: Record<string, unknown> = {}) =>
  parseCalendarEvent({ app: "lando", source_id: "e1", op: "upsert", title: "Rabies booster", start: "2026-12-02T09:30", ...extra }) as Upsert;

describe("the Graph event body", () => {
  it("writes a timed event in the Denver zone, as given, with no UTC conversion", () => {
    const g = toGraphEvent(up({ end: "2026-12-02T10:15", notes: "bring the card" }));
    expect(g).toMatchObject({
      subject: "Rabies booster",
      body: { contentType: "text", content: "bring the card" },
      start: { dateTime: "2026-12-02T09:30:00", timeZone: DENVER },
      end: { dateTime: "2026-12-02T10:15:00", timeZone: DENVER },
      isAllDay: false,
    });
    expect(DENVER).toBe("Mountain Standard Time"); // Windows' name for America/Denver, daylight saving included
  });

  it("an all-day event is midnight to midnight and Graph's end is the day AFTER the last day", () => {
    const g = toGraphEvent(up({ all_day: true, start: "2026-12-30", end: "2026-12-31" }));
    expect(g).toMatchObject({ isAllDay: true, start: { dateTime: "2026-12-30T00:00:00", timeZone: DENVER }, end: { dateTime: "2027-01-01T00:00:00", timeZone: DENVER } });
    // a one-day event ends the next midnight
    expect(toGraphEvent(up({ all_day: true, start: "2026-12-02" }))).toMatchObject({ end: { dateTime: "2026-12-03T00:00:00" } });
  });

  it("a create carries a transaction id and no recurrence when there is none; an update clears one with null", () => {
    expect(toGraphEvent(up(), "row-1")).toMatchObject({ transactionId: "row-1" });
    expect(toGraphEvent(up(), "row-1")).not.toHaveProperty("recurrence");
    const update = toGraphEvent(up());
    expect(update).not.toHaveProperty("transactionId");
    expect(update).toHaveProperty("recurrence", null);
  });

  it("names a calendar after its app", () => {
    expect(calendarName("lando")).toBe("Lando");
    expect(calendarName("pit-row")).toBe("Pit Row");
  });
});

describe("recurrence to patternedRecurrence", () => {
  const rec = (recurrence: Record<string, unknown>, start = "2026-12-02T09:30") => toGraphRecurrence(up({ start, recurrence }).recurrence!, up({ start }).start);

  it("a weekly repeat falls on the start's own weekday by default (2026-12-02 is a Wednesday), forever", () => {
    expect(rec({ freq: "weekly" })).toEqual({
      pattern: { type: "weekly", interval: 1, daysOfWeek: ["wednesday"], firstDayOfWeek: "sunday" },
      range: { type: "noEnd", startDate: "2026-12-02" },
    });
  });

  it("a weekly repeat with its own days and an interval, ending on a day", () => {
    expect(rec({ freq: "weekly", interval: 2, days_of_week: ["monday", "friday"], until: "2027-06-30" })).toEqual({
      pattern: { type: "weekly", interval: 2, daysOfWeek: ["monday", "friday"], firstDayOfWeek: "sunday" },
      range: { type: "endDate", startDate: "2026-12-02", endDate: "2027-06-30" },
    });
  });

  it("monthly is absoluteMonthly on the start's day of the month", () => {
    expect(rec({ freq: "monthly", interval: 3 }, "2026-12-15T08:00").pattern).toEqual({ type: "absoluteMonthly", interval: 3, dayOfMonth: 15 });
  });

  it("yearly is absoluteYearly on the start's month and day", () => {
    expect(rec({ freq: "yearly" }, "2026-03-09T08:00").pattern).toEqual({ type: "absoluteYearly", interval: 1, month: 3, dayOfMonth: 9 });
  });

  it("daily has an interval and nothing else", () => {
    expect(rec({ freq: "daily", interval: 4 }).pattern).toEqual({ type: "daily", interval: 4 });
  });

  it("an all-day repeat starts on its start day", () => {
    const e = up({ all_day: true, start: "2026-12-02", recurrence: { freq: "yearly" } });
    expect(toGraphEvent(e)).toMatchObject({ isAllDay: true, recurrence: { range: { startDate: "2026-12-02" }, pattern: { type: "absoluteYearly", month: 12, dayOfMonth: 2 } } });
  });
});

describe("the Graph calls", () => {
  it("authorizes against the consumers endpoint with the two scopes and the state", () => {
    const u = new URL(authorizeUrl({ clientId: "cid", clientSecret: "s" }, "https://grid.example/api/calendar/callback", "st"));
    expect(u.pathname).toBe("/consumers/oauth2/v2.0/authorize");
    expect(u.searchParams.get("scope")).toBe("Calendars.ReadWrite offline_access");
    expect(u.searchParams.get("state")).toBe("st");
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.toString()).not.toContain("secret");
  });

  it("a failure keeps the status and Graph's code and drops its message (which can quote the event)", async () => {
    const g = fakeGraph(() => ({ status: 400, body: { error: { code: "ErrorInvalidRecurrence", message: "Private Title is wrong" } } }));
    const err = await updateEvent(g.fetchImpl, "tok", "id", {}).catch((e) => e);
    expect(err).toBeInstanceOf(GraphError);
    expect(err.short).toBe("graph 400 ErrorInvalidRecurrence");
    expect(JSON.stringify(err)).not.toContain("Private Title");
    expect(err.message).not.toContain("Private Title");
  });

  it("a network failure is a GraphError, never a throw of the raw error", async () => {
    const err = await deleteEvent(async () => { throw new Error("boom: Private Title"); }, "tok", "id").catch((e) => e);
    expect(err).toBeInstanceOf(GraphError);
    expect(err.short).toBe("graph 0 unreachable");
  });

  it("a token refresh posts the refresh token and the client secret to the consumers endpoint, and reads both tokens back", async () => {
    const g = fakeGraph();
    const t = await refreshTokens(g.fetchImpl, { clientId: "cid", clientSecret: "sec" }, "old");
    expect(g.calls[0].url).toContain("/consumers/oauth2/v2.0/token");
    expect(g.calls[0].body).toMatchObject({ grant_type: "refresh_token", refresh_token: "old", client_id: "cid", client_secret: "sec" });
    expect(t).toEqual({ accessToken: "access-1", refreshToken: "refresh-1" });
  });

  it("a deleted-already event (404) is not an error, but an update says it is gone", async () => {
    const g = fakeGraph(() => ({ status: 404, body: { error: { code: "ErrorItemNotFound" } } }));
    await expect(deleteEvent(g.fetchImpl, "tok", "id")).resolves.toBeUndefined();
    await expect(updateEvent(g.fetchImpl, "tok", "id", {})).resolves.toBe(false);
  });
});
