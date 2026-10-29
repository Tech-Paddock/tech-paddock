import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/api/health` reports whether `CRON_SECRET` is usable (TEC-166): present and
 * long enough, never its value. The database probe is mocked.
 */
vi.mock("@/lib/supabase", () => ({
  getServiceClient: () => ({ from: () => ({ select: () => ({ limit: async () => ({ error: null }) }) }) }),
}));

const SECRET = "test-cron-secret-0123456789-abcdefghij"; // made up, 38 characters

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.CRON_SECRET;
});
afterEach(() => {
  if (saved === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = saved;
});

type Body = { checks: { name: string; ok: boolean; detail: string }[] };
const probe = async () => {
  const { GET } = await import("@/app/api/health/route");
  const res = await GET();
  const text = JSON.stringify(await res.clone().json());
  const body = (await res.json()) as Body;
  return { text, check: body.checks.find((c) => c.name === "cronSecret")! };
};

describe("the cronSecret check", () => {
  it("passes for a secret of 32 or more characters, and never carries it", async () => {
    process.env.CRON_SECRET = SECRET;
    const { check, text } = await probe();
    expect(check.ok).toBe(true);
    expect(text).not.toContain(SECRET);
  });

  it("fails when unset", async () => {
    delete process.env.CRON_SECRET;
    const { check } = await probe();
    expect(check.ok).toBe(false);
    expect(check.detail).toContain("not set");
  });

  it("fails when under 32 characters, without echoing it", async () => {
    process.env.CRON_SECRET = "short-secret-value";
    const { check, text } = await probe();
    expect(check.ok).toBe(false);
    expect(text).not.toContain("short-secret-value");
  });
});
