import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const probe = vi.hoisted(() => ({ error: null as null | { message: string }, table: "" }));

vi.mock("@/lib/supabase", () => ({
  getServiceClient: () => ({
    from(table: string) {
      probe.table = table;
      return { select: () => ({ limit: async () => ({ error: probe.error }) }) };
    },
  }),
}));

import { GET } from "@/app/api/health/route";

const ENV = { ...process.env };
beforeEach(() => {
  probe.error = null;
  probe.table = "";
  process.env.SESSION_SECRET = "test-session-secret-0123456789-abcdefghij";
});
afterEach(() => {
  process.env = { ...ENV };
});

describe("GET /api/health", () => {
  it("probes a real pitrow table and is ok when it answers", async () => {
    const res = await GET();
    expect(probe.table).toBe("people");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.checks.map((c: { name: string }) => c.name)).toEqual(["database", "sessionSecret"]);
  });

  it("is a 503 and names the exposed-schemas list when the schema is not reachable", async () => {
    probe.error = { message: "Invalid schema: pitrow" };
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.checks[0].detail).toContain("exposed-schemas");
  });

  it("is a 503 without SESSION_SECRET", async () => {
    delete process.env.SESSION_SECRET;
    expect((await GET()).status).toBe(503);
  });
});
