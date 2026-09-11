import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase, mockModules } from "./helpers/fakeSupabase";

const fixture = (n: string) => readFileSync(join(__dirname, "fixtures", n));
const upload = (name: string, bytes: Buffer, field = "file") => {
  const body = new FormData();
  body.append(field, new File([new Uint8Array(bytes)], name));
  return new NextRequest("http://localhost/x", { method: "POST", body });
};

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/supabase");
  vi.doUnmock("@/lib/storage");
});

describe("template upload", () => {
  it("writes the file before the row, so a row never points at a missing object", async () => {
    const order: string[] = [];
    const { client, calls } = fakeSupabase({
      "templates.select": { data: { version: 2 }, error: null },
      "templates.update": { data: { id: "t1", version: 3, is_active: true }, error: null },
      "templates.insert": () => {
        order.push("row");
        return { data: { id: "t1", version: 3, is_active: false }, error: null };
      },
    });
    mockModules({
      resume: client,
      upload: async () => {
        order.push("file");
        return "templates/x.docx";
      },
    });

    const { POST } = await import("../app/api/templates/route");
    const res = await POST(upload("template.docx", fixture("template-sample.docx")));

    expect(res.status).toBe(201);
    expect(order).toEqual(["file", "row"]);
    // The new version follows the highest existing one.
    // Inserted inactive, then activated — see the ordering test below.
    expect(calls.find((c) => c.op === "insert")?.payload).toMatchObject({ version: 3, is_active: false });
  });

  it("inserts nothing when the upload fails", async () => {
    const { client, calls } = fakeSupabase({ "templates.select": { data: null, error: null } });
    mockModules({
      resume: client,
      upload: async () => {
        const { StorageError } = await import("../lib/storage");
        throw new StorageError("bucket unreachable");
      },
    });

    const { POST } = await import("../app/api/templates/route");
    const res = await POST(upload("template.docx", fixture("template-sample.docx")));

    expect(res.status).toBe(502);
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("inserts before deactivating, so a failed insert never leaves nothing active", async () => {
    const { client, calls } = fakeSupabase({
      "templates.select": { data: { version: 1 }, error: null },
      "templates.update": { data: { id: "t2", is_active: true }, error: null },
      "templates.insert": { data: { id: "t2" }, error: null },
    });
    mockModules({ resume: client });

    const { POST } = await import("../app/api/templates/route");
    await POST(upload("template.docx", fixture("template-sample.docx")));

    const insert = calls.findIndex((c) => c.op === "insert");
    const updates = calls.map((c, i) => [c, i] as const).filter(([c]) => c.op === "update");
    expect(insert).toBeGreaterThanOrEqual(0);
    expect(updates).toHaveLength(2);

    const [[clearCall, clearIndex], [activateCall, activateIndex]] = updates;
    expect(insert).toBeLessThan(clearIndex);
    expect(clearCall.payload).toEqual({ is_active: false });
    expect(activateCall.payload).toEqual({ is_active: true });
    expect(activateCall.filters).toContainEqual(["id", "t2"]);
    expect(clearIndex).toBeLessThan(activateIndex);
  });

  it("deactivates nothing when activating an id that does not exist", async () => {
    const { client, calls } = fakeSupabase({ "templates.select": { data: null, error: null } });
    mockModules({ resume: client });

    const { PATCH } = await import("../app/api/templates/[id]/route");
    const res = await PATCH(
      new NextRequest("http://localhost/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: true }),
      }),
      { params: { id: "ghost" } }
    );

    expect(res.status).toBe(404);
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });
});

describe("reformat against the stored template", () => {
  it("returns 409 with a usable message when no template is active", async () => {
    const { client } = fakeSupabase({ "templates.select": { data: null, error: null } });
    mockModules({ resume: client });

    const { POST } = await import("../app/api/reformat/route");
    const res = await POST(upload("jobright.docx", fixture("jobright-sample.docx"), "source"));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("no_template");
    expect(body.error).toMatch(/Templates tab/);
  });

  it("stores source and output before recording the render", async () => {
    const order: string[] = [];
    const { client, calls } = fakeSupabase({
      "templates.select": {
        data: { id: "t1", version: 1, name: "template.docx", spec: { font: "Calibri", bodySize: 10, headingSize: 11, nameSize: 16, contactSize: 9, entrySize: 11, headingBold: true, headingColor: null, nameColor: null, margins: { top: 0.6, right: 0.75, bottom: 0.6, left: 0.75 }, spacing: { before: 40, after: 40, line: null }, bulletGlyph: "•", highlightsStyle: "table" } },
        error: null,
      },
      "renders.insert": () => {
        order.push("row");
        return { data: { id: "r1" }, error: null };
      },
    });
    mockModules({
      resume: client,
      upload: async (prefix) => {
        order.push(`file:${prefix}`);
        return `${prefix}/x.docx`;
      },
    });

    const { POST } = await import("../app/api/reformat/route");
    const res = await POST(upload("jobright.docx", fixture("jobright-sample.docx"), "source"));

    expect(res.status).toBe(200);
    expect(order).toEqual(["file:sources", "file:renders", "row"]);

    const body = await res.json();
    expect(body.renderId).toBe("r1");
    expect(body.templateLabel).toContain("v1");
    expect(body.coverage.percent).toBe(100);

    // The snapshot is the spec as it was, so the render stays reproducible.
    expect(calls.find((c) => c.op === "insert")?.payload).toMatchObject({ template_id: "t1" });
  });
});

describe("recording where a render went", () => {
  const patch = (body: unknown) =>
    new NextRequest("http://localhost/x", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("creates a tracker thread when the render has none", async () => {
    const { client: resume } = fakeSupabase({
      "renders.select": { data: { id: "r1", thread_id: null }, error: null },
      "renders.update": { data: { id: "r1", thread_id: "th1", submitted_at: null }, error: null },
    });
    const { client: tracker, calls: trackerCalls } = fakeSupabase({
      "pipeline_threads.insert": { data: { id: "th1" }, error: null },
    });
    mockModules({ resume, tracker });

    const { PATCH } = await import("../app/api/renders/[id]/route");
    const res = await PATCH(patch({ company: "Proseware", role: "Product Analyst II" }), { params: { id: "r1" } });

    expect(res.status).toBe(200);
    const insert = trackerCalls.find((c) => c.op === "insert");
    expect(insert?.payload).toMatchObject({ company: "Proseware", stage: "Applied" });
    expect((insert?.payload as { notes: string }).notes).toContain("Product Analyst II");
  });

  it("updates the existing thread instead of creating a duplicate", async () => {
    const { client: resume } = fakeSupabase({
      "renders.select": { data: { id: "r1", thread_id: "th9" }, error: null },
      "renders.update": { data: { id: "r1" }, error: null },
    });
    const { client: tracker, calls: trackerCalls } = fakeSupabase({
      "pipeline_threads.update": { data: null, error: null },
    });
    mockModules({ resume, tracker });

    const { PATCH } = await import("../app/api/renders/[id]/route");
    await PATCH(patch({ company: "Proseware" }), { params: { id: "r1" } });

    expect(trackerCalls.some((c) => c.op === "insert")).toBe(false);
    const update = trackerCalls.find((c) => c.op === "update");
    expect(update?.filters).toContainEqual(["id", "th9"]);
  });

  it("appends to the running log and clears the stale-task flag", async () => {
    const { client: resume } = fakeSupabase({
      "renders.select": { data: { id: "r1", thread_id: "th9" }, error: null },
      "renders.update": { data: { id: "r1" }, error: null },
    });
    const { client: tracker, calls: trackerCalls } = fakeSupabase({
      "pipeline_threads.select": { data: { notes: "Earlier note worth keeping" }, error: null },
      "pipeline_threads.update": { data: null, error: null },
    });
    mockModules({ resume, tracker });

    const { PATCH } = await import("../app/api/renders/[id]/route");
    await PATCH(patch({ company: "Proseware", role: "Product Analyst II" }), { params: { id: "r1" } });

    const payload = trackerCalls.find((c) => c.op === "update")?.payload as {
      notes: string;
      open_task_id: string | null;
    };
    // notes is a running log — the earlier entry survives.
    expect(payload.notes).toContain("Earlier note worth keeping");
    expect(payload.notes).toContain("Product Analyst II");
    // Touching a thread frees the stale check to raise a fresh Google Task.
    expect(payload.open_task_id).toBeNull();
  });

  it("touches no thread when no company is named — rendered but not sent is valid", async () => {
    const { client: resume } = fakeSupabase({
      "renders.select": { data: { id: "r1", thread_id: null }, error: null },
      "renders.update": { data: { id: "r1" }, error: null },
    });
    const { client: tracker, calls: trackerCalls } = fakeSupabase({});
    mockModules({ resume, tracker });

    const { PATCH } = await import("../app/api/renders/[id]/route");
    const res = await PATCH(patch({ submittedAt: null }), { params: { id: "r1" } });

    expect(res.status).toBe(200);
    expect(trackerCalls).toEqual([]);
  });

  it("404s for a render that does not exist", async () => {
    const { client: resume } = fakeSupabase({ "renders.select": { data: null, error: null } });
    mockModules({ resume, tracker: resume });

    const { PATCH } = await import("../app/api/renders/[id]/route");
    const res = await PATCH(patch({ company: "Proseware" }), { params: { id: "nope" } });
    expect(res.status).toBe(404);
  });
});

describe("downloading a stored render", () => {
  it("404s cleanly when nothing was stored", async () => {
    const { client } = fakeSupabase({ "renders.select": { data: { output_file_path: null }, error: null } });
    mockModules({ resume: client });

    const { GET } = await import("../app/api/renders/[id]/file/route");
    const res = await GET(new NextRequest("http://localhost/x"), { params: { id: "r1" } });
    expect(res.status).toBe(404);
  });

  it("returns the stored bytes rather than re-rendering", async () => {
    const { client } = fakeSupabase({
      "renders.select": { data: { output_file_path: "renders/kept.docx" }, error: null },
    });
    mockModules({ resume: client, download: async () => Buffer.from("STORED-BYTES") });

    const { GET } = await import("../app/api/renders/[id]/file/route");
    const res = await GET(new NextRequest("http://localhost/x"), { params: { id: "r1" } });

    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("STORED-BYTES");
    expect(res.headers.get("content-disposition")).toContain("kept.docx");
  });
});
