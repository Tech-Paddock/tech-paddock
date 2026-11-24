import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getServiceClient, JWT_FUTURE, noStoreFetch, retryingFetch } from "@/lib/supabase";

// The service role key bypasses RLS, so the schema pinned on this client is
// the only thing standing between this app and every other tool's data.

const ENV = { ...process.env };

beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-for-tests";
});

afterEach(() => {
  process.env = { ...ENV };
  vi.unstubAllGlobals();
});

describe("the service client", () => {
  it("sends every query to the pitrow schema", () => {
    expect(getServiceClient().from("anything")["schema" as never]).toBe("pitrow");
  });

  it("reaches no other tool's schema", () => {
    const client = getServiceClient();
    for (const other of ["public", "resume", "coffee", "health", "cookbook", "lando", "grid", "calendar"]) {
      expect(client.from("anything")["schema" as never], other).not.toBe(other);
    }
  });

  it("will not start without its two variables", () => {
    delete process.env.SUPABASE_URL;
    expect(() => getServiceClient()).toThrow(/SUPABASE_URL/);
  });

  it("sends every request with cache: no-store", async () => {
    const f = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", f);
    await noStoreFetch("https://example.test/x", { method: "GET" });
    expect((f.mock.calls[0] as unknown[])[1]).toMatchObject({ cache: "no-store" });
  });

  it("retries once on 401 'JWT issued at future', and no other 401", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response(JWT_FUTURE, { status: 401 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect((await retryingFetch("https://example.test/x")).status).toBe(200);
    expect(f).toHaveBeenCalledTimes(2);

    const g = vi.fn(async () => new Response("bad key", { status: 401 }));
    vi.stubGlobal("fetch", g);
    expect((await retryingFetch("https://example.test/x")).status).toBe(401);
    expect(g).toHaveBeenCalledTimes(1);
  });
});
