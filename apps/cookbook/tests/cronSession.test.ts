import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import { COOKIES, createSessionCookieValue, readSession } from "@/lib/auth";

/**
 * A signed-in browser does not open the scheduler's path (TEC-132, TEC-166).
 * `/api/cron/prices` takes `Authorization: Bearer <CRON_SECRET>` and nothing
 * else: a valid session cookie, which opens every other route, is refused there
 * unless the bearer secret comes with it. `tests/gate.test.ts` is the same file
 * in every app and holds the bearer rules; this file holds the session half,
 * for the one app that has the route. The scan itself is mocked.
 */
const SECRET = "test-cron-secret-0123456789-abcdefghij"; // made up, 38 characters

const run = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/priceRun", () => ({
  runPriceNight: async () => {
    run.calls += 1;
    return { night: "2026-10-27" };
  },
}));

const passed = (res: Response) => res.headers.get("x-middleware-next") === "1";

let saved: { cron?: string; session?: string };
let session: string;
beforeEach(async () => {
  saved = { cron: process.env.CRON_SECRET, session: process.env.SESSION_SECRET };
  process.env.SESSION_SECRET = "test-session-secret-0123456789-abcdefghij";
  process.env.CRON_SECRET = SECRET;
  run.calls = 0;
  session = await createSessionCookieValue();
});
afterEach(() => {
  for (const [k, v] of [["CRON_SECRET", saved.cron], ["SESSION_SECRET", saved.session]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const call = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`https://example.test${path}`, { headers: { cookie: `${COOKIES.SESSION}=${session}`, ...headers } });

describe("a valid session cookie on /api/cron/prices", () => {
  it("is a real session: the same cookie opens another API route at the gate", async () => {
    expect(await readSession(session)).not.toBeNull();
    expect(passed(await proxy(call("/api/grocery")))).toBe(true);
  });

  it("is refused at the gate without the bearer secret", async () => {
    const res = await proxy(call("/api/cron/prices"));
    expect(res.status).toBe(401);
    expect(passed(res)).toBe(false);
  });

  it("is refused at the gate when the bearer is wrong, the cookie notwithstanding", async () => {
    const res = await proxy(call("/api/cron/prices", { authorization: `Bearer ${SECRET}x` }));
    expect(res.status).toBe(401);
    expect(passed(res)).toBe(false);
  });

  it("is refused at the gate when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await proxy(call("/api/cron/prices"));
    expect(res.status).toBe(401);
    expect(passed(res)).toBe(false);
  });

  it("is refused by the route itself too, and the scan never runs", async () => {
    const { GET } = await import("@/app/api/cron/prices/route");
    expect((await GET(call("/api/cron/prices"))).status).toBe(401);
    expect(run.calls).toBe(0);
  });

  it("does not stop the bearer secret from passing", async () => {
    const res = await proxy(call("/api/cron/prices", { authorization: `Bearer ${SECRET}` }));
    expect(passed(res)).toBe(true);
  });
});
