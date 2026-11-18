import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStore } from "./memoryStore";

const mem = vi.hoisted(() => ({ current: null as null | { store: unknown } }));
vi.mock("@/lib/calendar/store", async (orig) => ({
  ...(await orig<typeof import("@/lib/calendar/store")>()),
  supabaseStore: () => mem.current!.store,
}));

import { GET as callback } from "@/app/api/calendar/callback/route";
import { GET as connect } from "@/app/api/calendar/connect/route";
import { POST as events } from "@/app/api/calendar/events/route";
import { POST as sendNow } from "@/app/api/calendar/flush/route";
import { GET as status } from "@/app/api/calendar/status/route";
import { daysLeft, secretWarning, SECRET_EXPIRES } from "@/lib/calendar/expiry";

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

const post = (body: unknown) => new Request("https://grid.test/api/calendar/events", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
const good = { app: "lando", source_id: "e1", op: "upsert", title: "Vet", start: "2026-12-02T09:30" };

/** A fetch that is Microsoft: tokens, then ids. */
function stubMicrosoft() {
  let n = 0;
  const f = vi.fn(async (url: string) =>
    url.includes("/oauth2/") ? Response.json({ access_token: "a", refresh_token: "r-new" }) : Response.json({ id: `g${++n}` }),
  );
  vi.stubGlobal("fetch", f);
  return f;
}

describe("POST /api/calendar/events", () => {
  it("appends to the outbox and pushes it, answering how many still wait", async () => {
    stubMicrosoft();
    const res = await events(post(good));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, unsent: 0 });
    expect(m.s.outbox).toHaveLength(1);
    expect(m.s.events.get("lando/e1")).toBeTruthy();
  });

  it("keeps the event and still answers 200 when Outlook is not connected", async () => {
    m = memoryStore({ token: null });
    mem.current = m;
    const res = await events(post(good));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, unsent: 1 });
    expect(m.s.outbox[0].sent_at).toBeNull();
  });

  it("answers 200 with the event kept even if the push itself throws", async () => {
    m.store.unsent = vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValue([]);
    // the first read is the flush's; the append has already happened by then
    const res = await events(post(good));
    expect(res.status).toBe(200);
    expect(m.s.outbox).toHaveLength(1);
  });

  it("is a 400 for a bad event, without repeating it, and appends nothing", async () => {
    for (const bad of [{ ...good, title: "" }, { ...good, start: "tomorrow-ish private" }, "not json"]) {
      const res = await events(post(bad));
      expect(res.status).toBe(400);
      expect(JSON.stringify(await res.json())).not.toContain("private");
    }
    expect(m.s.outbox).toHaveLength(0);
  });

  it("is a 500 when the outbox cannot take the event, so the caller knows it was not accepted", async () => {
    m.store.append = async () => {
      throw new Error("db down");
    };
    expect((await events(post(good))).status).toBe(500);
  });

  it("exports no method but POST", async () => {
    const mod = await import("@/app/api/calendar/events/route");
    expect(Object.keys(mod).filter((k) => /^(GET|PUT|PATCH|DELETE)$/.test(k))).toEqual([]);
  });
});

describe("the connect flow", () => {
  it("connect sends the browser to Microsoft's consumers endpoint with a state it also keeps in a cookie", () => {
    const res = connect(new Request("https://grid.test/api/calendar/connect"));
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.origin + to.pathname).toBe("https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize");
    expect(to.searchParams.get("redirect_uri")).toBe("https://grid.test/api/calendar/callback");
    expect(res.headers.get("set-cookie")).toContain(`calendar_oauth_state=${to.searchParams.get("state")}`);
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
  });

  it("connect without the Microsoft keys is a 503 that sends nowhere", () => {
    delete process.env.MS_CLIENT_ID;
    expect(connect(new Request("https://grid.test/api/calendar/connect")).status).toBe(503);
  });

  const back = (qs: string, cookie?: string) =>
    callback(new Request(`https://grid.test/api/calendar/callback?${qs}`, { headers: cookie ? { cookie } : {} }));

  it("callback with a matching state stores only the refresh token and returns to /more", async () => {
    const f = stubMicrosoft();
    const res = await back("code=abc&state=s1", "paddock_session=x; calendar_oauth_state=s1");
    expect(res.headers.get("location")).toBe("https://grid.test/more?calendar=connected");
    expect(m.s.token).toBe("r-new");
    expect(m.s.tokenSaves).toEqual(["r-new"]);
    const body = (f.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body;
    expect(body.get("code")).toBe("abc");
    expect(body.get("redirect_uri")).toBe("https://grid.test/api/calendar/callback");
  });

  it("callback refuses a state that does not match the cookie, a missing cookie, a missing code, or Microsoft's refusal", async () => {
    const f = stubMicrosoft();
    for (const [qs, cookie] of [
      ["code=abc&state=s1", "calendar_oauth_state=other"],
      ["code=abc&state=s1", undefined],
      ["state=s1", "calendar_oauth_state=s1"],
      ["error=access_denied&state=s1", "calendar_oauth_state=s1"],
    ] as const) {
      const res = await back(qs, cookie);
      expect(res.headers.get("location")).toBe("https://grid.test/more?calendar=failed");
    }
    expect(f).not.toHaveBeenCalled();
    expect(m.s.token).toBe("refresh-0");
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    expect((await back("code=abc&state=s1", "calendar_oauth_state=s1")).headers.get("location")).toContain("failed");
  });
});

describe("GET /api/calendar/status and the expiry warning", () => {
  it("reports connection, unsent count, last error and the secret's date, never a token", async () => {
    await m.store.append({ app: "lando", source_id: "e1", op: "delete", payload: { op: "delete", app: "lando", source_id: "e1" } });
    await m.store.markError("row-1", "graph 503 ServiceNotAvailable");
    const body = await (await status()).json();
    expect(body).toMatchObject({ configured: true, connected: true, unsent: 1, last_error: "graph 503 ServiceNotAvailable", secret_expires: SECRET_EXPIRES });
    expect(JSON.stringify(body)).not.toMatch(/refresh-0|token/);
  });

  it("is a 503 naming the exposed-schemas list when the database cannot be read", async () => {
    m.store.status = async () => {
      throw new Error("Invalid schema: calendar");
    };
    const res = await status();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("exposed-schemas");
  });

  it("warns within 30 days of 2028-11-16 and after it, and is silent before", () => {
    expect(SECRET_EXPIRES).toBe("2028-11-16");
    expect(secretWarning(new Date("2028-10-16T12:00:00Z"))).toBeNull(); // 31 days
    expect(secretWarning(new Date("2028-10-17T12:00:00Z"))).toContain("in 30 days");
    expect(secretWarning(new Date("2028-11-15T12:00:00Z"))).toContain("tomorrow");
    expect(secretWarning(new Date("2028-11-16T12:00:00Z"))).toContain("today");
    expect(secretWarning(new Date("2028-11-17T12:00:00Z"))).toContain("expired");
    expect(daysLeft(new Date("2026-11-17T00:00:00Z"))).toBe(730);
  });
});

describe("POST /api/calendar/flush", () => {
  it("pushes what is waiting", async () => {
    m = memoryStore();
    mem.current = m;
    await m.store.append({ app: "lando", source_id: "e1", op: "upsert", payload: { op: "upsert", app: "lando", source_id: "e1", title: "Vet", all_day: false, start: "2026-12-02T09:30:00", end: "2026-12-02T10:30:00", recurrence: null, notes: null } });
    stubMicrosoft();
    expect(await (await sendNow()).json()).toMatchObject({ ok: true, sent: 1, unsent: 0 });
  });
});
