import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/stale-tasks/route";

/**
 * The daily sweep's auth guard.
 *
 * `middleware.ts` waves `/api/cron/*` past the password gate, so this guard is
 * the only thing in front of the route. It used to read `if (secret && …)`,
 * which left the endpoint open whenever `CRON_SECRET` was unset — safe only
 * because `graphConfigured()` returned early underneath it. These tests pin the
 * guard closed so that safety no longer depends on an unrelated feature flag.
 *
 * Every case here runs with `MS_GRAPH_*` unset, so a request that gets past the
 * guard stops at the Outlook check and never reaches Supabase.
 */

const GRAPH_VARS = ["MS_GRAPH_CLIENT_ID", "MS_GRAPH_CLIENT_SECRET", "MS_GRAPH_REFRESH_TOKEN"];

let saved: Record<string, string | undefined>;

function request(authorization?: string): NextRequest {
  return new NextRequest("https://tracker.techpaddock.io/api/cron/stale-tasks", {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  saved = Object.fromEntries(
    ["CRON_SECRET", ...GRAPH_VARS].map((k) => [k, process.env[k]])
  );
  for (const key of GRAPH_VARS) delete process.env[key];
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("the stale sweep's CRON_SECRET guard", () => {
  it("rejects every caller when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;

    const res = await GET(request());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("rejects a caller presenting a bearer token when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;

    const res = await GET(request("Bearer anything-at-all"));

    expect(res.status).toBe(401);
  });

  it("rejects a request carrying no authorization header", async () => {
    process.env.CRON_SECRET = "correct-horse";

    const res = await GET(request());

    expect(res.status).toBe(401);
  });

  it("rejects a wrong secret", async () => {
    process.env.CRON_SECRET = "correct-horse";

    const res = await GET(request("Bearer battery-staple"));

    expect(res.status).toBe(401);
  });

  it("rejects the bare secret without the Bearer scheme", async () => {
    process.env.CRON_SECRET = "correct-horse";

    const res = await GET(request("correct-horse"));

    expect(res.status).toBe(401);
  });

  it("gives an unset secret and a wrong secret byte-identical answers", async () => {
    process.env.CRON_SECRET = "correct-horse";
    const wrong = await GET(request("Bearer battery-staple"));

    delete process.env.CRON_SECRET;
    const unset = await GET(request("Bearer battery-staple"));

    expect(unset.status).toBe(wrong.status);
    await expect(unset.json()).resolves.toEqual(await wrong.json());
  });

  it("lets the right secret through to the Outlook check", async () => {
    process.env.CRON_SECRET = "correct-horse";

    const res = await GET(request("Bearer correct-horse"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      skipped: "Outlook is not connected",
      created: 0,
    });
  });
});
