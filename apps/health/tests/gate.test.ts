import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

/**
 * The gate's one scheduler exception (TEC-132). This file is the same in every
 * app, like the gate it holds: `/api/cron/prices` passes without a session only
 * with the right bearer secret, and every other request to it is a 401.
 */
const SECRET = "test-cron-secret-0123456789-abcdefghij"; // made up, 38 characters

const call = (path: string, headers: Record<string, string> = {}) =>
  proxy(new NextRequest(`https://example.test${path}`, { headers }));

const passed = (res: Response) => res.headers.get("x-middleware-next") === "1";

let saved: { cron?: string; session?: string };
beforeEach(() => {
  saved = { cron: process.env.CRON_SECRET, session: process.env.SESSION_SECRET };
  process.env.SESSION_SECRET = "test-session-secret-0123456789-abcdefghij";
  process.env.CRON_SECRET = SECRET;
});
afterEach(() => {
  for (const [k, v] of [["CRON_SECRET", saved.cron], ["SESSION_SECRET", saved.session]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("the cron exception on /api/cron/prices", () => {
  it("passes with the right bearer secret and no session", async () => {
    expect(passed(await call("/api/cron/prices", { authorization: `Bearer ${SECRET}` }))).toBe(true);
  });

  it("no header is a 401", async () => {
    const res = await call("/api/cron/prices");
    expect(res.status).toBe(401);
    expect(passed(res)).toBe(false);
  });

  it("a wrong secret is a 401", async () => {
    expect((await call("/api/cron/prices", { authorization: `Bearer ${SECRET}x` })).status).toBe(401);
    expect((await call("/api/cron/prices", { authorization: `Bearer ${SECRET.slice(1)}` })).status).toBe(401);
    expect((await call("/api/cron/prices", { authorization: "Bearer " })).status).toBe(401);
  });

  it("the scheme must be Bearer", async () => {
    expect((await call("/api/cron/prices", { authorization: SECRET })).status).toBe(401);
    expect((await call("/api/cron/prices", { authorization: `Basic ${SECRET}` })).status).toBe(401);
  });

  it("an unset secret refuses even an empty or matching header", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("/api/cron/prices", { authorization: "Bearer " })).status).toBe(401);
    expect((await call("/api/cron/prices", { authorization: "Bearer undefined" })).status).toBe(401);
    expect((await call("/api/cron/prices")).status).toBe(401);
  });

  it("a secret under 32 characters refuses even when the header matches it", async () => {
    const short = "x".repeat(31);
    process.env.CRON_SECRET = short;
    expect((await call("/api/cron/prices", { authorization: `Bearer ${short}` })).status).toBe(401);
    process.env.CRON_SECRET = "x".repeat(32);
    expect(passed(await call("/api/cron/prices", { authorization: `Bearer ${"x".repeat(32)}` }))).toBe(true);
  });

  it("is the exact path only: a prefix, a child or a trailing slash is still gated", async () => {
    const auth = { authorization: `Bearer ${SECRET}` };
    for (const path of ["/api/cron/prices2", "/api/cron/prices/", "/api/cron/prices/x", "/api/cron", "/api/cron/other"]) {
      const res = await call(path, auth);
      expect(res.status, path).toBe(401);
      expect(passed(res), path).toBe(false);
    }
  });

  it("the bearer secret opens nothing else", async () => {
    const res = await call("/api/grocery", { authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(401);
    const page = await call("/list", { authorization: `Bearer ${SECRET}` });
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toContain("/login");
  });
});
