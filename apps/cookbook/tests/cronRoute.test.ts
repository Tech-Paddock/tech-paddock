import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";

/**
 * `/api/cron/prices` checks `CRON_SECRET` itself (TEC-132), behind the gate's
 * own check (`tests/gate.test.ts`). The scan is mocked: what is held here is
 * that nothing runs without the secret, and that the body carries counts only.
 */

const SECRET = "test-cron-secret-0123456789-abcdefghij"; // made up, 38 characters

const run = vi.hoisted(() => ({ calls: 0, result: null as unknown, error: null as unknown }));

vi.mock("@/lib/priceRun", () => ({
  runPriceNight: async () => {
    run.calls += 1;
    if (run.error) throw run.error;
    return run.result;
  },
}));

const request = (headers: Record<string, string> = {}) => new NextRequest("https://example.test/api/cron/prices", { headers });

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.CRON_SECRET;
  process.env.CRON_SECRET = SECRET;
  run.calls = 0;
  run.error = null;
  run.result = { night: "2026-10-27", store: "Test Store", saved: 2, written: 2, alreadyRecorded: 0, notReturned: 0, noPrice: 0, rollup: null };
});
afterEach(() => {
  if (saved === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = saved;
});

describe("the route checks the secret itself", () => {
  it("runs the scan with the right bearer secret and returns its counts", async () => {
    const { GET } = await import("@/app/api/cron/prices/route");
    const res = await GET(request({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ night: "2026-10-27", written: 2 });
    expect(run.calls).toBe(1);
  });

  it("no header, a wrong secret, or a wrong scheme is a 401 and the scan never runs", async () => {
    const { GET } = await import("@/app/api/cron/prices/route");
    for (const headers of [{} as Record<string, string>, { authorization: `Bearer ${SECRET}x` }, { authorization: "Bearer wrong" }, { authorization: SECRET }, { authorization: `Basic ${SECRET}` }]) {
      expect((await GET(request(headers))).status).toBe(401);
    }
    expect(run.calls).toBe(0);
  });

  it("an unset or short secret refuses everything, even a matching header", async () => {
    const { GET } = await import("@/app/api/cron/prices/route");
    delete process.env.CRON_SECRET;
    expect((await GET(request({ authorization: "Bearer " }))).status).toBe(401);
    expect((await GET(request({ authorization: "Bearer undefined" }))).status).toBe(401);
    process.env.CRON_SECRET = "short-secret";
    expect((await GET(request({ authorization: "Bearer short-secret" }))).status).toBe(401);
    expect(run.calls).toBe(0);
  });

  it("a failed scan is an error status with a sentence, never a 200 and never a secret", async () => {
    const { UpstreamError } = await import("@/lib/errors");
    run.error = new UpstreamError("Kroger's product lookup failed (HTTP 503).");
    const { GET } = await import("@/app/api/cron/prices/route");
    const res = await GET(request({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(502);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("Kroger's product lookup failed");
    expect(text).not.toContain(SECRET);
  });

  it("has no POST: Vercel Cron calls GET", async () => {
    const route = await import("@/app/api/cron/prices/route");
    expect("POST" in route).toBe(false);
  });
});

describe("cronAuthorized", () => {
  it("is exact: the secret, the Bearer scheme, at least 32 characters", () => {
    expect(cronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(cronAuthorized(`Bearer ${SECRET} `, SECRET)).toBe(false);
    expect(cronAuthorized(`bearer ${SECRET}`, SECRET)).toBe(false);
    expect(cronAuthorized(null, SECRET)).toBe(false);
    expect(cronAuthorized(`Bearer ${SECRET}`, "")).toBe(false);
    expect(cronAuthorized(`Bearer ${"x".repeat(31)}`, "x".repeat(31))).toBe(false);
    expect(cronAuthorized(`Bearer ${"x".repeat(32)}`, "x".repeat(32))).toBe(true);
  });
});
