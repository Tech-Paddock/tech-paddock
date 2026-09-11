import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, mockModules } from "./helpers/fakeSupabase";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/supabase");
  vi.doUnmock("@/lib/storage");
});

const withStorage = (client: ReturnType<typeof fakeSupabase>["client"], listError: { message: string } | null) =>
  Object.assign(client, {
    storage: { from: () => ({ list: async () => ({ data: [], error: listError }) }) },
  });

describe("GET /api/health", () => {
  it("reports healthy when every dependency answers", async () => {
    const { client } = fakeSupabase({
      "templates.select": { data: { name: "template.docx", version: 3 }, error: null },
      "pipeline_threads.select": { data: [], error: null },
    });
    const withBucket = withStorage(client, null);
    mockModules({ resume: withBucket, tracker: withBucket });

    const { GET } = await import("../app/api/health/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.checks.find((c: { name: string }) => c.name === "active_template").detail).toContain("v3");
  });

  it("names the failing dependency instead of a generic error", async () => {
    const { client } = fakeSupabase({
      "templates.select": { data: null, error: { message: "permission denied for schema resume" } },
      "pipeline_threads.select": { data: [], error: null },
    });
    const withBucket = withStorage(client, null);
    mockModules({ resume: withBucket, tracker: withBucket });

    const { GET } = await import("../app/api/health/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.checks.find((c: { name: string }) => c.name === "database")).toMatchObject({
      ok: false,
      detail: "permission denied for schema resume",
    });
  });

  it("stays healthy with no template set — that is setup, not breakage", async () => {
    const { client } = fakeSupabase({
      "templates.select": { data: null, error: null },
      "pipeline_threads.select": { data: [], error: null },
    });
    const withBucket = withStorage(client, null);
    mockModules({ resume: withBucket, tracker: withBucket });

    const { GET } = await import("../app/api/health/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.checks.find((c: { name: string }) => c.name === "active_template").ok).toBe(false);
  });

  it("fails when the storage bucket is unreachable", async () => {
    const { client } = fakeSupabase({
      "templates.select": { data: { name: "t", version: 1 }, error: null },
      "pipeline_threads.select": { data: [], error: null },
    });
    const withBucket = withStorage(client, { message: "Bucket not found" });
    mockModules({ resume: withBucket, tracker: withBucket });

    const { GET } = await import("../app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).checks.find((c: { name: string }) => c.name === "storage").detail).toBe("Bucket not found");
  });
});
