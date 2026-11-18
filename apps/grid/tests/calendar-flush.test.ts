import { describe, expect, it } from "vitest";
import { flush } from "@/lib/calendar/flush";
import { parseCalendarEvent } from "@/lib/calendar/validate";
import { fakeGraph, memoryStore } from "./memoryStore";

const creds = { clientId: "cid", clientSecret: "sec" };
const ev = (extra: Record<string, unknown> = {}) =>
  parseCalendarEvent({ app: "lando", source_id: "e1", op: "upsert", title: "Rabies booster", start: "2026-12-02T09:30", ...extra });
const del = (app = "lando", source_id = "e1") => parseCalendarEvent({ app, source_id, op: "delete" });
const run = (m: ReturnType<typeof memoryStore>, g: ReturnType<typeof fakeGraph>, now?: () => number) => flush({ store: m.store, fetchImpl: g.fetchImpl, creds, now });
const graphCalls = (g: ReturnType<typeof fakeGraph>) => g.calls.filter((c) => !c.url.includes("/oauth2/"));

describe("flush: pushing the outbox to Outlook", () => {
  it("makes the app's calendar once, creates the event, and remembers both ids", async () => {
    const m = memoryStore();
    await m.add(ev());
    const g = fakeGraph();
    const r = await run(m, g);
    expect(r).toMatchObject({ sent: 1, unsent: 0, busy: false, error: null });
    expect(graphCalls(g).map((c) => `${c.method} ${c.url.replace("https://graph.microsoft.com/v1.0", "")}`)).toEqual(["POST /me/calendars", "POST /me/calendars/graph-1/events"]);
    expect(graphCalls(g)[0].body).toEqual({ name: "Lando" });
    expect(graphCalls(g)[1].body).toMatchObject({ subject: "Rabies booster", transactionId: "row-1" });
    expect(m.s.calendars.get("lando")).toBe("graph-1");
    expect(m.s.events.get("lando/e1")).toBe("graph-2");
    expect(m.s.outbox[0].sent_at).not.toBeNull();
  });

  it("a second app gets its own calendar; a second event in the same app reuses the first's", async () => {
    const m = memoryStore();
    await m.add(ev());
    await m.add(ev({ source_id: "e2" }));
    await m.add(ev({ app: "grid", source_id: "r1", title: "Stretch" }));
    const g = fakeGraph();
    await run(m, g);
    const made = graphCalls(g).filter((c) => c.url.endsWith("/me/calendars"));
    expect(made.map((c) => c.body)).toEqual([{ name: "Lando" }, { name: "Grid" }]);
  });

  it("an event sent again updates the same Graph event rather than making another", async () => {
    const m = memoryStore();
    await m.add(ev());
    await run(m, fakeGraph());
    await m.add(ev({ title: "Rabies booster, moved", start: "2026-12-03T09:30" }));
    const g = fakeGraph();
    const r = await run(m, g);
    expect(r.sent).toBe(1);
    const calls = graphCalls(g);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "PATCH", url: "https://graph.microsoft.com/v1.0/me/events/graph-2" });
    expect(calls[0].body).toMatchObject({ subject: "Rabies booster, moved", start: { dateTime: "2026-12-03T09:30:00" } });
    expect(calls[0].body).not.toHaveProperty("transactionId");
  });

  it("an update whose event is gone from Outlook (404) creates it again", async () => {
    const m = memoryStore();
    await m.add(ev());
    await run(m, fakeGraph());
    await m.add(ev({ title: "Again" }));
    const g = fakeGraph((c) => (c.method === "PATCH" ? { status: 404, body: { error: { code: "ErrorItemNotFound" } } } : undefined));
    await run(m, g);
    expect(graphCalls(g).map((c) => c.method)).toEqual(["PATCH", "POST"]);
    expect(m.s.events.get("lando/e1")).toMatch(/^graph-/);
  });

  it("a delete removes the Graph event and its map entry; a delete of something never sent does nothing", async () => {
    const m = memoryStore();
    await m.add(ev());
    await run(m, fakeGraph());
    await m.add(del());
    await m.add(del("lando", "never-sent"));
    const g = fakeGraph();
    const r = await run(m, g);
    expect(r).toMatchObject({ sent: 2, unsent: 0 });
    expect(graphCalls(g).map((c) => `${c.method} ${c.url.split("/me/")[1]}`)).toEqual(["DELETE events/graph-2"]);
    expect(m.s.events.size).toBe(0);
  });

  it("a weekly repeat reaches Graph as a patternedRecurrence", async () => {
    const m = memoryStore();
    await m.add(ev({ recurrence: { freq: "weekly", interval: 1 } }));
    const g = fakeGraph();
    await run(m, g);
    expect(graphCalls(g)[1].body).toMatchObject({ recurrence: { pattern: { type: "weekly", daysOfWeek: ["wednesday"] }, range: { type: "noEnd", startDate: "2026-12-02" } } });
  });

  describe("retry", () => {
    it("a failed row stays unsent with a short error and goes through on the next flush", async () => {
      const m = memoryStore();
      await m.add(ev());
      const down = fakeGraph((c) => (c.url.endsWith("/events") ? { status: 503, body: { error: { code: "ServiceNotAvailable", message: "Rabies booster" } } } : undefined));
      const r1 = await run(m, down);
      expect(r1).toMatchObject({ sent: 0, unsent: 1, error: "graph 503 ServiceNotAvailable" });
      expect(m.s.outbox[0]).toMatchObject({ sent_at: null, error: "graph 503 ServiceNotAvailable" });
      expect(JSON.stringify(m.s.outbox[0])).not.toContain("message");
      expect(m.s.events.size).toBe(0);

      const r2 = await run(m, fakeGraph());
      expect(r2).toMatchObject({ sent: 1, unsent: 0, error: null });
      expect(m.s.outbox[0]).toMatchObject({ error: null });
      expect(m.s.outbox[0].sent_at).not.toBeNull();
      // the calendar made on the first attempt is reused, not made twice
      expect(m.s.calendars.get("lando")).toBe("graph-1");
    });

    it("one bad row does not stop the rows after it", async () => {
      const m = memoryStore();
      await m.add(ev({ source_id: "bad" }));
      await m.add(ev({ source_id: "good" }));
      const g = fakeGraph((c) => ((c.body as { transactionId?: string } | undefined)?.transactionId === "row-1" ? { status: 400, body: { error: { code: "ErrorInvalidRecurrence" } } } : undefined));
      const r = await run(m, g);
      expect(r).toMatchObject({ sent: 1, unsent: 1, error: "graph 400 ErrorInvalidRecurrence" });
      expect(m.s.events.has("lando/good")).toBe(true);
    });

    it("a corrected event supersedes the failing one before it instead of waiting behind it", async () => {
      const m = memoryStore();
      await m.add(ev({ title: "Wrong" }));
      await run(m, fakeGraph(() => undefined), undefined);
      // first flush succeeded; make a failing one, then a fix
      await m.add(ev({ title: "Bad" }));
      await run(m, fakeGraph((c) => (c.method === "PATCH" ? { status: 400, body: { error: { code: "ErrorInvalid" } } } : undefined)));
      expect(m.s.outbox[1].sent_at).toBeNull();
      await m.add(ev({ title: "Fixed" }));
      const g = fakeGraph();
      const r = await run(m, g);
      expect(r).toMatchObject({ sent: 1, unsent: 0 });
      expect(graphCalls(g)).toHaveLength(1);
      expect(graphCalls(g)[0].body).toMatchObject({ subject: "Fixed" });
      expect(m.s.outbox[1]).toMatchObject({ error: "superseded" });
      expect(m.s.outbox[1].sent_at).not.toBeNull();
    });

    it("an upsert then a delete for one event, sent together, makes no event and no extra calls", async () => {
      const m = memoryStore();
      await m.add(ev());
      await m.add(del());
      const g = fakeGraph();
      const r = await run(m, g);
      expect(r).toMatchObject({ sent: 1, unsent: 0 });
      expect(graphCalls(g)).toHaveLength(0);
    });

    it("a throttled flush (429) stops there and leaves the rest for the next one", async () => {
      const m = memoryStore();
      await m.add(ev({ source_id: "a" }));
      await m.add(ev({ source_id: "b" }));
      const g = fakeGraph((c) => (c.url.endsWith("/me/calendars") ? { status: 429, body: { error: { code: "TooManyRequests" } } } : undefined));
      const r = await run(m, g);
      expect(r).toMatchObject({ sent: 0, unsent: 2, error: "graph 429 TooManyRequests" });
      expect(graphCalls(g)).toHaveLength(1);
    });

    it("a calendar deleted in Outlook is forgotten, so the next flush makes it again", async () => {
      const m = memoryStore();
      await m.add(ev());
      await run(m, fakeGraph());
      await m.add(ev({ source_id: "e2" }));
      await run(m, fakeGraph((c) => (c.url.endsWith("/events") ? { status: 404, body: { error: { code: "ErrorItemNotFound" } } } : undefined)));
      expect(m.s.calendars.has("lando")).toBe(false);
      const g = fakeGraph();
      await run(m, g);
      expect(graphCalls(g)[0]).toMatchObject({ method: "POST", url: "https://graph.microsoft.com/v1.0/me/calendars" });
      expect(m.s.events.has("lando/e2")).toBe(true);
    });

    it("stops starting rows once its time budget is spent", async () => {
      const m = memoryStore();
      await m.add(ev({ source_id: "a" }));
      await m.add(ev({ source_id: "b" }));
      let t = 0;
      const r = await run(m, fakeGraph(), () => (t += 40_000));
      expect(r.unsent).toBeGreaterThan(0);
    });
  });

  describe("the connection", () => {
    it("saves the refresh token Microsoft hands back, and uses it on the next flush", async () => {
      const m = memoryStore({ token: "refresh-0" });
      await m.add(ev());
      const g = fakeGraph();
      await run(m, g);
      expect(g.calls[0].body).toMatchObject({ refresh_token: "refresh-0" });
      expect(m.s.token).toBe("refresh-1");
      await m.add(ev({ source_id: "e2" }));
      const g2 = fakeGraph();
      await run(m, g2);
      expect(g2.calls[0].body).toMatchObject({ refresh_token: "refresh-1" });
    });

    it("with nothing to send it does not touch Microsoft, so the token is not needlessly replaced", async () => {
      const m = memoryStore();
      const g = fakeGraph();
      expect(await run(m, g)).toMatchObject({ sent: 0, unsent: 0 });
      expect(g.calls).toHaveLength(0);
      expect(m.s.tokenSaves).toEqual([]);
    });

    it("not connected: rows stay unsent and say to open the connect link; Microsoft is not called", async () => {
      const m = memoryStore({ token: null });
      await m.add(ev());
      const g = fakeGraph();
      const r = await run(m, g);
      expect(r).toMatchObject({ sent: 0, unsent: 1, error: "not connected" });
      expect(m.s.outbox[0].error).toContain("connect link");
      expect(g.calls).toHaveLength(0);
    });

    it("keys missing: rows stay unsent and say so", async () => {
      const m = memoryStore();
      await m.add(ev());
      const r = await flush({ store: m.store, fetchImpl: fakeGraph().fetchImpl, creds: null });
      expect(r).toMatchObject({ sent: 0, unsent: 1, error: "not configured" });
      expect(m.s.outbox[0].error).toContain("MS_CLIENT_ID");
    });

    it("a refresh that Microsoft refuses leaves every row unsent, names the reconnect step, and saves nothing", async () => {
      const m = memoryStore();
      await m.add(ev());
      const g = fakeGraph(() => ({ status: 400, body: { error: "invalid_grant", error_description: "private" } }));
      const r = await run(m, g);
      expect(r).toMatchObject({ sent: 0, unsent: 1, error: "graph 400 invalid_grant" });
      expect(m.s.outbox[0].error).toContain("open the connect link");
      expect(m.s.tokenSaves).toEqual([]);
      expect(m.s.locked).toBe(false);
    });

    it("another flush holding the lock: busy, nothing sent, the rows wait in the outbox", async () => {
      const m = memoryStore({ locked: true });
      await m.add(ev());
      const g = fakeGraph();
      expect(await run(m, g)).toMatchObject({ busy: true, sent: 0, unsent: 1 });
      expect(g.calls).toHaveLength(0);
    });

    it("always releases the lock, even when the database fails mid-flush", async () => {
      const m = memoryStore();
      await m.add(ev());
      m.store.saveEventId = async () => {
        throw new Error("db down");
      };
      await expect(run(m, fakeGraph())).rejects.toThrow();
      expect(m.s.locked).toBe(false);
    });
  });
});
