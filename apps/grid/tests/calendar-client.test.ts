import { describe, expect, it, vi } from "vitest";
import { CALENDAR_BASE_URL, CALENDAR_EVENTS_PATH, sendCalendarEvent, type CalendarEvent } from "@/lib/calendar-client";

const event: CalendarEvent = { app: "lando", source_id: "e1", op: "upsert", title: "Vet", start: "2026-12-02T09:30" };
const req = (cookie: string | null) => ({ headers: { get: (n: string) => (n.toLowerCase() === "cookie" && cookie !== null ? cookie : null) } });

describe("sendCalendarEvent", () => {
  it("posts the event to the calendar route forwarding only paddock_session", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    const r = await sendCalendarEvent(req("theme=dark; paddock_session=abc.def; other=secret"), event, { fetchImpl: f });
    expect(r).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${CALENDAR_BASE_URL}${CALENDAR_EVENTS_PATH}`);
    expect(url).toBe("https://grid.techpaddock.io/api/calendar/events");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).cookie).toBe("paddock_session=abc.def");
    expect(JSON.stringify(init.headers)).not.toContain("secret");
    expect(JSON.parse(init.body as string)).toEqual(event);
    expect(init.redirect).toBe("manual");
  });

  it("sends to the base url it is given, and only that (the host is never taken from the request)", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    await sendCalendarEvent(req("paddock_session=abc"), event, { baseUrl: "https://calendar.example", fetchImpl: f });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("https://calendar.example/api/calendar/events");
  });

  it("is not ok on a non-200, a redirect to login, or no session; and sends nothing without a session", async () => {
    for (const status of [401, 302, 400, 500]) {
      expect(await sendCalendarEvent(req("paddock_session=abc"), event, { fetchImpl: async () => new Response(null, { status }) })).toEqual({ ok: false });
    }
    const f = vi.fn();
    expect(await sendCalendarEvent(req(null), event, { fetchImpl: f })).toEqual({ ok: false });
    expect(await sendCalendarEvent(req("theme=dark"), event, { fetchImpl: f })).toEqual({ ok: false });
    expect(f).not.toHaveBeenCalled();
  });

  it("never throws: not for a dead network, a timeout, or a request with no headers at all", async () => {
    expect(await sendCalendarEvent(req("paddock_session=abc"), event, { fetchImpl: async () => { throw new TypeError("fetch failed"); } })).toEqual({ ok: false });
    expect(await sendCalendarEvent(req("paddock_session=abc"), event, { fetchImpl: () => new Promise((_, rej) => setTimeout(() => rej(new DOMException("t", "TimeoutError")), 1)) })).toEqual({ ok: false });
    expect(await sendCalendarEvent({} as never, event)).toEqual({ ok: false });
  });
});
