import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getServiceClient } from "@/lib/supabase";

// The service role key bypasses RLS, so the schema pinned on this client is
// the only thing standing between this app and every other tool's data. These
// assertions read it off the query builder rather than off the source text,
// because what matters is where a query actually goes.

const ENV = { ...process.env };

beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-for-tests";
});

afterEach(() => {
  process.env = { ...ENV };
});

describe("the service client", () => {
  it("sends every query to the health schema", () => {
    // Guardrail 5 — never read or write another tool's schema. The default is
    // `public`, which this repo does not use at all, so an omitted `db.schema`
    // does not fail: it silently queries a schema with nothing in it.
    expect(getServiceClient().from("anything")["schema" as never]).toBe("health");
  });

  it("reaches no other tool's schema", () => {
    // Named rather than implied. Each of these is a real schema on the same
    // Postgres instance, reachable with this key, holding somebody else's data.
    const client = getServiceClient();
    for (const other of ["public", "shared", "editor", "tracker", "resume", "coffee"]) {
      expect(client.from("anything")["schema" as never], other).not.toBe(other);
    }
  });

  it("throws when its credentials are missing rather than returning a client", () => {
    // Guardrail 2 — a failed lookup must never look like "not found". A client
    // built on an undefined URL would construct fine and then return empty
    // results, which is indistinguishable on screen from a food nobody has
    // logged yet, and is exactly how the numbers start drifting again.
    for (const missing of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
      delete process.env[missing];
      expect(() => getServiceClient(), missing).toThrow(/must be set/);
      process.env[missing] = "restored-for-the-next-case";
    }
  });
});
