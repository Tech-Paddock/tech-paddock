import { describe, expect, it, vi } from "vitest";
import { CALENDAR_BASE_URL, CALENDAR_WEEK_PATH, fetchCalendarWeek } from "@/lib/calendar-client";

const req = (cookie: string | null) => ({ headers: { get: (n: string) => (n.toLowerCase() === "cookie" && cookie !== null ? cookie : null) } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const timed = { calendar: "Household", title: "Dentist", start: "2026-12-02T09:30", end: "2026-12-02T10:30", all_day: false };
const allDay = { calendar: "Household", title: "Trip", start: "2026-12-03", end: "2026-12-05", all_day: true };

describe("fetchCalendarWeek", () => {
  it("gets the week from the calendar route, forwarding only paddock_session", async () => {
    const f = vi.fn(async () => json({ ok: true, events: [timed, allDay] }));
    const r = await fetchCalendarWeek(req("theme=dark; paddock_session=abc.def; other=secret"), "2026-11-29", { fetchImpl: f });
    expect(r).toEqual({ ok: true, events: [timed, allDay] });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${CALENDAR_BASE_URL}${CALENDAR_WEEK_PATH}?start=2026-11-29`);
    expect(url).toBe("https://grid.techpaddock.io/api/calendar/week?start=2026-11-29");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).cookie).toBe("paddock_session=abc.def");
    expect(JSON.stringify(init.headers)).not.toContain("secret");
    expect(init.redirect).toBe("manual");
  });

  it("an empty week that Grid answered ok is an ok empty list", async () => {
    expect(await fetchCalendarWeek(req("paddock_session=a"), "2026-11-29", { fetchImpl: async () => json({ ok: true, events: [] }) })).toEqual({ ok: true, events: [] });
  });

  it("reads each failure as a failure with its reason, never as an empty week", async () => {
    const answer = (status: number) => fetchCalendarWeek(req("paddock_session=a"), "2026-11-29", { fetchImpl: async () => new Response("{}", { status }) });
    expect(await answer(503)).toEqual({ ok: false, error: "not_connected" });
    expect(await answer(502)).toEqual({ ok: false, error: "microsoft" });
    expect(await answer(400)).toEqual({ ok: false, error: "bad_start" });
    expect(await answer(401)).toEqual({ ok: false, error: "signed_out" });
    expect(await answer(302)).toEqual({ ok: false, error: "signed_out" });
    expect(await answer(500)).toEqual({ ok: false, error: "unavailable" });
  });

  it("does not trust an answer that is not the contract", async () => {
    const bad = [
      { ok: false, events: [] },
      { ok: true },
      { ok: true, events: "none" },
      { ok: true, events: [{ ...timed, all_day: true }] },
      { ok: true, events: [{ ...allDay, all_day: false }] },
      { ok: true, events: [{ ...timed, start: "tomorrow" }] },
      { ok: true, events: [{ ...timed, title: 5 }] },
      { ok: true, events: [timed, null] },
    ];
    for (const body of bad) {
      expect(await fetchCalendarWeek(req("paddock_session=a"), "2026-11-29", { fetchImpl: async () => json(body) }), JSON.stringify(body)).toEqual({ ok: false, error: "unavailable" });
    }
    expect(await fetchCalendarWeek(req("paddock_session=a"), "2026-11-29", { fetchImpl: async () => new Response("<html>", { status: 200 }) })).toEqual({ ok: false, error: "unavailable" });
  });

  it("sends nothing without a session or with a bad start", async () => {
    const f = vi.fn();
    expect(await fetchCalendarWeek(req(null), "2026-11-29", { fetchImpl: f })).toEqual({ ok: false, error: "signed_out" });
    expect(await fetchCalendarWeek(req("theme=dark"), "2026-11-29", { fetchImpl: f })).toEqual({ ok: false, error: "signed_out" });
    expect(await fetchCalendarWeek(req("paddock_session=a"), "29-11-2026", { fetchImpl: f })).toEqual({ ok: false, error: "bad_start" });
    expect(await fetchCalendarWeek(req("paddock_session=a"), "2026-11-29&x=1", { fetchImpl: f })).toEqual({ ok: false, error: "bad_start" });
    expect(f).not.toHaveBeenCalled();
  });

  it("never throws: not for a dead network, a timeout, or a request with no headers at all", async () => {
    expect(await fetchCalendarWeek(req("paddock_session=a"), "2026-11-29", { fetchImpl: async () => { throw new TypeError("fetch failed"); } })).toEqual({ ok: false, error: "unavailable" });
    expect(await fetchCalendarWeek(req("paddock_session=a"), "2026-11-29", { fetchImpl: () => new Promise((_, rej) => setTimeout(() => rej(new DOMException("t", "TimeoutError")), 1)) })).toEqual({ ok: false, error: "unavailable" });
    expect(await fetchCalendarWeek({} as never, "2026-11-29")).toEqual({ ok: false, error: "unavailable" });
  });
});
