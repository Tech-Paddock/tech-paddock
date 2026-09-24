import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Typed as taking arguments so `mock.calls[0][2]` is the options object the
// app passed, not an index into an empty tuple — `tsc --noEmit` checks tests.
const createClient = vi.fn((..._args: unknown[]) => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: (...a: unknown[]) => createClient(...a) }));

/**
 * The one rule in this app's charter that a copy-paste can break silently.
 *
 * `apps/cookbook` was scaffolded by copying `apps/health`, and the single most
 * likely thing to survive that copy wrong is the schema pin — it is one word,
 * it is not in a filename, and nothing in a build or a typecheck would object
 * to it saying `health`. The failure would not be an error either: the app
 * would read and write another tool's tables perfectly happily, which is
 * exactly what the charter's "never another app's schema" exists to stop.
 *
 * `drift` cannot catch this. It checksums the files that must be *identical*
 * across apps, and `lib/supabase.ts` is deliberately a per-app variant.
 */
describe("the Supabase client", () => {
  const env = process.env;

  beforeEach(() => {
    vi.resetModules();
    createClient.mockClear();
    process.env = { ...env, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role-key" };
  });

  afterEach(() => {
    process.env = env;
  });

  it("pins the cookbook schema and no other", async () => {
    const { getServiceClient } = await import("../lib/supabase");
    getServiceClient();

    expect(createClient).toHaveBeenCalledTimes(1);
    const options = createClient.mock.calls[0][2] as { db?: { schema?: string } };
    expect(options?.db?.schema).toBe("cookbook");
  });

  it("does not persist a session — this key is server-side only", async () => {
    const { getServiceClient } = await import("../lib/supabase");
    getServiceClient();

    const options = createClient.mock.calls[0][2] as { auth?: { persistSession?: boolean } };
    expect(options?.auth?.persistSession).toBe(false);
  });

  /**
   * Throwing is the designed behaviour, and it matters more than it looks: a
   * client built from `undefined` would fail later, inside a request, as a
   * confusing network or auth error rather than as a missing-configuration
   * one. The standup hands Joel a list of environment variables to set by
   * hand, so "one of them is missing" is a live possibility on day one.
   */
  it("refuses to build a client when either variable is missing", async () => {
    const { getServiceClient } = await import("../lib/supabase");

    for (const missing of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
      const saved = process.env[missing];
      delete process.env[missing];
      expect(() => getServiceClient()).toThrow(/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set/);
      process.env[missing] = saved;
    }

    expect(createClient).not.toHaveBeenCalled();
  });
});
