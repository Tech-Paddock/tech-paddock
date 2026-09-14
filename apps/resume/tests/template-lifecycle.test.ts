import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, mockModules } from "./helpers/fakeSupabase";

/**
 * Archiving, deleting and downloading a template.
 *
 * The database double covers write ordering and branch selection, not SQL. The
 * foreign key from `renders.template_id` is what ultimately makes a destructive
 * delete impossible, and it is only ever exercised against the real project —
 * these tests cover the check that turns it into a sentence the user can act on.
 */

const TEMPLATE = { id: "t1", version: 3, name: "house-style.docx", is_active: false, file_path: "templates/3.docx", archived_at: null };

beforeEach(() => vi.resetModules());
afterEach(() => vi.doUnmock("@/lib/supabase"));

const req = (body?: unknown) =>
  ({ json: async () => body ?? {} }) as unknown as import("next/server").NextRequest;

describe("deleting a template", () => {
  it("removes the row and then the stored file when no render points at it", async () => {
    const removed: string[] = [];
    const { client, calls } = fakeSupabase({
      "templates.select": { data: TEMPLATE, error: null },
      "renders.select": { data: null, error: null, count: 0 },
      "templates.delete": { data: null, error: null },
    });
    mockModules({ resume: client, remove: async (path) => void removed.push(path as string) });

    const { DELETE } = await import("@/app/api/templates/[id]/route");
    const res = await DELETE(req(), { params: { id: "t1" } });

    expect(res.status).toBe(200);
    expect(removed).toEqual(["templates/3.docx"]);
    // Row first: the reverse leaves a row pointing at bytes that are gone.
    const ops = calls.map((c) => `${c.table}.${c.op}`);
    expect(ops).toContain("templates.delete");
  });

  it("refuses, with the alternative, when renders were built from it", async () => {
    const { client, calls } = fakeSupabase({
      "templates.select": { data: TEMPLATE, error: null },
      "renders.select": { data: null, error: null, count: 2 },
    });
    mockModules({ resume: client });

    const { DELETE } = await import("@/app/api/templates/[id]/route");
    const res = await DELETE(req(), { params: { id: "t1" } });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("has_renders");
    expect(body.error).toContain("Archive it instead");
    expect(calls.map((c) => `${c.table}.${c.op}`)).not.toContain("templates.delete");
  });

  it("refuses to delete the active template", async () => {
    const { client, calls } = fakeSupabase({
      "templates.select": { data: { ...TEMPLATE, is_active: true }, error: null },
    });
    mockModules({ resume: client });

    const { DELETE } = await import("@/app/api/templates/[id]/route");
    const res = await DELETE(req(), { params: { id: "t1" } });

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("active_template");
    expect(calls.map((c) => `${c.table}.${c.op}`)).not.toContain("templates.delete");
  });

  it("404s on an id that is not there", async () => {
    const { client } = fakeSupabase({ "templates.select": { data: null, error: null } });
    mockModules({ resume: client });

    const { DELETE } = await import("@/app/api/templates/[id]/route");
    expect((await DELETE(req(), { params: { id: "nope" } })).status).toBe(404);
  });

  // The template is gone as far as the app is concerned; a failure to tidy up
  // the object is not something the user can act on or usefully retry.
  it("still reports success when the file could not be removed", async () => {
    const { client } = fakeSupabase({
      "templates.select": { data: TEMPLATE, error: null },
      "renders.select": { data: null, error: null, count: 0 },
      "templates.delete": { data: null, error: null },
    });
    mockModules({
      resume: client,
      // Resolved from inside the mocked module graph: vi.resetModules() means a
      // StorageError imported before the mock is a different class object, and
      // the route's `instanceof` would not match it.
      remove: async () => {
        const { StorageError } = await import("@/lib/storage");
        throw new StorageError("bucket unreachable");
      },
    });

    const { DELETE } = await import("@/app/api/templates/[id]/route");
    expect((await DELETE(req(), { params: { id: "t1" } })).status).toBe(200);
  });
});

describe("archiving a template", () => {
  it("stamps archived_at", async () => {
    const { client, calls } = fakeSupabase({
      "templates.select": { data: TEMPLATE, error: null },
      "templates.update": { data: { ...TEMPLATE, archived_at: "2026-09-14T00:00:00Z" }, error: null },
    });
    mockModules({ resume: client });

    const { PATCH } = await import("@/app/api/templates/[id]/route");
    const res = await PATCH(req({ archived: true }), { params: { id: "t1" } });

    expect(res.status).toBe(200);
    const update = calls.find((c) => c.op === "update")?.payload as { archived_at: string | null };
    expect(update.archived_at).toBeTruthy();
  });

  it("clears it again on restore", async () => {
    const { client, calls } = fakeSupabase({
      "templates.select": { data: { ...TEMPLATE, archived_at: "2026-09-14T00:00:00Z" }, error: null },
      "templates.update": { data: TEMPLATE, error: null },
    });
    mockModules({ resume: client });

    const { PATCH } = await import("@/app/api/templates/[id]/route");
    await PATCH(req({ archived: false }), { params: { id: "t1" } });

    expect((calls.find((c) => c.op === "update")?.payload as { archived_at: null }).archived_at).toBeNull();
  });

  // /api/reformat refuses to run without an active template, so archiving the
  // active one would leave the app unable to render anything.
  it("refuses to archive the active template", async () => {
    const { client } = fakeSupabase({ "templates.select": { data: { ...TEMPLATE, is_active: true }, error: null } });
    mockModules({ resume: client });

    const { PATCH } = await import("@/app/api/templates/[id]/route");
    const res = await PATCH(req({ archived: true }), { params: { id: "t1" } });

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("active_template");
  });

  it("refuses to activate an archived template", async () => {
    const { client, calls } = fakeSupabase({
      "templates.select": { data: { ...TEMPLATE, archived_at: "2026-09-14T00:00:00Z" }, error: null },
    });
    mockModules({ resume: client });

    const { PATCH } = await import("@/app/api/templates/[id]/route");
    const res = await PATCH(req({ is_active: true }), { params: { id: "t1" } });

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("archived");
    // Nothing was cleared: the current active template is untouched.
    expect(calls.map((c) => c.op)).not.toContain("update");
  });

  it("rejects a body asking for neither", async () => {
    const { client } = fakeSupabase({});
    mockModules({ resume: client });

    const { PATCH } = await import("@/app/api/templates/[id]/route");
    expect((await PATCH(req({ nonsense: true }), { params: { id: "t1" } })).status).toBe(400);
  });
});

describe("downloading a template", () => {
  it("returns the stored bytes as an attachment under the uploaded name", async () => {
    const { client } = fakeSupabase({ "templates.select": { data: TEMPLATE, error: null } });
    mockModules({ resume: client, download: async () => Buffer.from("PK-the-original") });

    const { GET } = await import("@/app/api/templates/[id]/file/route");
    const res = await GET(req(), { params: { id: "t1" } });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("house-style.docx");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("PK-the-original");
  });

  it("404s when the template has no stored file", async () => {
    const { client } = fakeSupabase({ "templates.select": { data: { ...TEMPLATE, file_path: null }, error: null } });
    mockModules({ resume: client });

    const { GET } = await import("@/app/api/templates/[id]/file/route");
    expect((await GET(req(), { params: { id: "t1" } })).status).toBe(404);
  });
});
