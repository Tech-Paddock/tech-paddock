import { createHmac } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { safeRedirectTarget } from "@/lib/safe-redirect";
import {
  COOKIES,
  createSessionCookieValue,
  isLockedOut,
  readAttempts,
  readSession,
  recordFailure,
  safeEqual,
} from "@/lib/auth";
import { handleLogin } from "@/lib/login";
import { middleware } from "@/middleware";

/**
 * The login path, hardened on 2026-09-24. What these pin:
 *
 * - `safeRedirectTarget`: only a path on this origin is ever followed after
 *   login, so `?from=` is no longer an open redirect or a script sink.
 * - `safeEqual`: the constant-time compare the middleware secrets use.
 * - The attempts cookie is plain, unsigned JSON, and anything malformed reads
 *   as zero attempts.
 * - Sessions are still signed exactly as before, so a cookie issued by the old
 *   code (crafted here with node:crypto, independently of lib/auth.ts) verifies.
 * - The shared login handler and this app's middleware, end to end, because
 *   tracker has the richest variant: the cron gate and the summary exception.
 *
 * The lib/ files are stamped from packages/shared, so this covers every app's
 * copy. It lives here because tracker has vitest and both middleware exceptions.
 */

const ORIGIN = "https://techpaddock.io";
const SECRET = "test-session-secret-0123456789abcdef";

const ENV_KEYS = ["SESSION_SECRET", "APP_PASSWORD_HASH", "CRON_SECRET", "INTERNAL_API_SECRET"];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.SESSION_SECRET = SECRET;
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/** A session cookie made the way the pre-2026-09-24 code made it. */
function legacySessionToken(payload: object, secret = SECRET) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("hex")}`;
}

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

describe("safeRedirectTarget", () => {
  it.each([
    ["/", "/"],
    ["/x?y#z", "/x?y#z"],
    ["/?app=coffee", "/?app=coffee"],
    ["/dashboard/a%2Fb", "/dashboard/a%2Fb"],
  ])("follows the same-origin path %j", (from, want) => {
    expect(safeRedirectTarget(from, ORIGIN)).toBe(want);
  });

  it.each([
    "//evil.com",
    "/\\evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,hi",
    "evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "\\\\evil.com",
    "/login",
    "/login/",
    "/login?from=/x",
    "",
  ])("sends %j to /", (from) => {
    expect(safeRedirectTarget(from, ORIGIN)).toBe("/");
  });

  it("sends null and undefined to /", () => {
    expect(safeRedirectTarget(null, ORIGIN)).toBe("/");
    expect(safeRedirectTarget(undefined, ORIGIN)).toBe("/");
  });

  it("never returns a full URL, only a path", () => {
    expect(safeRedirectTarget("/a/../b?c=1", ORIGIN)).toBe("/b?c=1");
  });

  it("treats an unparseable origin as a reason to go home", () => {
    expect(safeRedirectTarget("/x", "not an origin")).toBe("/");
  });
});

describe("safeEqual", () => {
  it("is true only for identical strings", () => {
    expect(safeEqual("correct-horse", "correct-horse")).toBe(true);
    expect(safeEqual("", "")).toBe(true);
    expect(safeEqual("correct-horse", "correct-horsf")).toBe(false);
    expect(safeEqual("correct-horse", "correct-hors")).toBe(false);
    expect(safeEqual("correct-hors", "correct-horse")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
    expect(safeEqual("abc", "ABC")).toBe(false);
  });

  it("handles non-ASCII input byte for byte", () => {
    expect(safeEqual("é", "é")).toBe(true);
    expect(safeEqual("é", "é")).toBe(false);
  });
});

describe("the attempts cookie", () => {
  it("round-trips as plain, unsigned base64url JSON", () => {
    const { cookieValue, attempts } = recordFailure(readAttempts(undefined));
    expect(attempts).toEqual({ count: 1, lockUntil: null });
    expect(cookieValue).not.toContain(".");
    expect(JSON.parse(Buffer.from(cookieValue, "base64url").toString("utf8"))).toEqual({ count: 1, lockUntil: null });
    expect(readAttempts(cookieValue)).toEqual({ count: 1, lockUntil: null });
  });

  it("locks at the fifth failure and not before", () => {
    const now = 1_000_000;
    let attempts = readAttempts(undefined, now);
    for (let i = 1; i <= 4; i++) {
      attempts = readAttempts(recordFailure(attempts, now).cookieValue, now);
      expect(isLockedOut(attempts, now)).toBe(false);
    }
    attempts = readAttempts(recordFailure(attempts, now).cookieValue, now);
    expect(attempts.count).toBe(5);
    expect(isLockedOut(attempts, now)).toBe(true);
    expect(isLockedOut(attempts, now + 15 * 60 * 1000 + 1)).toBe(false);
  });

  it.each([
    ["garbage", "!!!"],
    ["not base64 JSON", "abc"],
    ["an array", b64([1, 2])],
    ["a number", b64(7)],
    ["null", b64(null)],
    ["a string count", b64({ count: "4", lockUntil: null })],
    ["a negative count", b64({ count: -1, lockUntil: null })],
    ["a fractional count", b64({ count: 1.5, lockUntil: null })],
    ["a string lockUntil", b64({ count: 5, lockUntil: "later" })],
  ])("reads %s as no attempts", (_label, value) => {
    expect(readAttempts(value)).toEqual({ count: 0, lockUntil: null });
  });

  it("caps a planted lock at one lockout window from now", () => {
    const now = 1_000_000;
    const planted = readAttempts(b64({ count: 5, lockUntil: now + 365 * 24 * 60 * 60 * 1000 }), now);
    expect(planted.lockUntil).toBe(now + 15 * 60 * 1000);
  });

  it("still reads a signed cookie issued before the change, by its body", () => {
    const legacy = `${b64({ count: 3, lockUntil: null })}.${"a".repeat(64)}`;
    expect(readAttempts(legacy)).toEqual({ count: 3, lockUntil: null });
  });
});

describe("the session cookie", () => {
  it("accepts a token signed the old way", async () => {
    const exp = Date.now() + 60_000;
    expect(await readSession(legacySessionToken({ exp }))).toEqual({ exp });
  });

  it("issues tokens the old verifier would accept", async () => {
    const token = await createSessionCookieValue();
    const [body, sig] = token.split(".");
    expect(sig).toBe(createHmac("sha256", SECRET).update(body).digest("hex"));
  });

  it("rejects a tampered, expired, re-cased, extended or foreign-key token", async () => {
    const good = legacySessionToken({ exp: Date.now() + 60_000 });
    const [body, sig] = good.split(".");
    const flipped = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0");
    expect(await readSession(`${body}.${flipped}`)).toBeNull();
    expect(await readSession(legacySessionToken({ exp: Date.now() - 1 }))).toBeNull();
    expect(await readSession(`${body}.${sig.toUpperCase()}`)).toBeNull();
    expect(await readSession(`${good}.extra`)).toBeNull();
    expect(await readSession(legacySessionToken({ exp: Date.now() + 60_000 }, "another-secret"))).toBeNull();
    expect(await readSession(`${body}.`)).toBeNull();
    expect(await readSession(undefined)).toBeNull();
  });

  it("does not accept an attempts payload as a session", async () => {
    expect(await readSession(legacySessionToken({ count: 1, lockUntil: null }))).toBeNull();
  });

  it("verifies against the current secret, not a cached key", async () => {
    const token = legacySessionToken({ exp: Date.now() + 60_000 });
    expect(await readSession(token)).not.toBeNull();
    process.env.SESSION_SECRET = "a-rotated-secret-0123456789abcdefgh";
    expect(await readSession(token)).toBeNull();
  });
});

describe("the shared login handler", () => {
  const login = (body: string, cookie?: string) =>
    handleLogin(
      new NextRequest(`${ORIGIN}/api/login`, {
        method: "POST",
        body,
        headers: { "content-type": "application/json", host: "techpaddock.io", ...(cookie ? { cookie } : {}) },
      })
    );

  beforeEach(() => {
    process.env.APP_PASSWORD_HASH = bcrypt.hashSync("right", 4);
  });

  it.each(["null", "7", "[]", "\"right\"", "not json", "{}", "{\"password\":5}"])(
    "answers the body %s with 401, not 500",
    async (body) => {
      const res = await login(body);
      expect(res.status).toBe(401);
      expect(res.cookies.get(COOKIES.ATTEMPTS)?.value).not.toContain(".");
    }
  );

  it("signs in with the right password", async () => {
    const res = await login(JSON.stringify({ password: "right" }));
    expect(res.status).toBe(200);
    expect(await readSession(res.cookies.get(COOKIES.SESSION)?.value)).not.toBeNull();
  });

  it("refuses while the counter says locked", async () => {
    const locked = `${COOKIES.ATTEMPTS}=${b64({ count: 5, lockUntil: Date.now() + 60_000 })}`;
    const res = await login(JSON.stringify({ password: "right" }), locked);
    expect(res.status).toBe(429);
  });
});

describe("tracker middleware", () => {
  const run = (path: string, headers: Record<string, string> = {}) =>
    middleware(new NextRequest(`${ORIGIN}${path}`, { headers }));
  const passes = (res: Response) => res.headers.get("x-middleware-next") === "1";

  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";
    process.env.INTERNAL_API_SECRET = "internal-secret";
  });

  it.each(["/login", "/api/login", "/favicon.ico", "/icon.svg", "/apple-icon.png", "/_next/static/x.js"])(
    "lets %s through signed out",
    async (path) => {
      expect(passes(await run(path))).toBe(true);
    }
  );

  it.each(["/loginx", "/login-history", "/favicon-maker", "/_nextfoo"])("sends %s to login", async (path) => {
    const res = await run(path);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it.each(["/api/logins", "/api/login-history"])("answers %s with 401", async (path) => {
    expect((await run(path)).status).toBe(401);
  });

  it("carries the query string in from", async () => {
    const res = await run("/?app=coffee");
    expect(new URL(res.headers.get("location")!).searchParams.get("from")).toBe("/?app=coffee");
  });

  it("gates /api/cron/* on the bearer itself", async () => {
    expect((await run("/api/cron/stale-tasks")).status).toBe(401);
    expect((await run("/api/cron/stale-tasks", { authorization: "Bearer wrong" })).status).toBe(401);
    expect((await run("/api/cron/anything-new")).status).toBe(401);
    expect(passes(await run("/api/cron/stale-tasks", { authorization: "Bearer cron-secret" }))).toBe(true);
  });

  it("admits nobody to /api/cron/* when CRON_SECRET is unset or empty", async () => {
    for (const value of [undefined, ""]) {
      if (value === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = value;
      expect((await run("/api/cron/stale-tasks", { authorization: "Bearer " })).status).toBe(401);
      expect((await run("/api/cron/stale-tasks", { authorization: "Bearer undefined" })).status).toBe(401);
    }
  });

  it("does not let a browser session into /api/cron/*", async () => {
    const session = `${COOKIES.SESSION}=${await createSessionCookieValue()}`;
    expect((await run("/api/cron/stale-tasks", { cookie: session })).status).toBe(401);
  });

  it("admits /api/summary with the internal secret and nothing else with it", async () => {
    expect(passes(await run("/api/summary", { "x-internal-secret": "internal-secret" }))).toBe(true);
    expect((await run("/api/summary", { "x-internal-secret": "wrong" })).status).toBe(401);
    expect((await run("/api/threads", { "x-internal-secret": "internal-secret" })).status).toBe(401);
    delete process.env.INTERNAL_API_SECRET;
    expect((await run("/api/summary", { "x-internal-secret": "" })).status).toBe(401);
  });

  it("lets a valid session through, including one signed the old way", async () => {
    const cookie = `${COOKIES.SESSION}=${legacySessionToken({ exp: Date.now() + 80 * 24 * 60 * 60 * 1000 })}`;
    expect(passes(await run("/api/threads", { cookie }))).toBe(true);
  });
});
