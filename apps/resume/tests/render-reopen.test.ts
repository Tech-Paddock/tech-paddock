import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase, mockModules } from "./helpers/fakeSupabase";
import { storedRenderView, type StoredRenderRow } from "../lib/storedRender";
import { verdictFor } from "../lib/verdict";

const fixture = (n: string) => readFileSync(join(__dirname, "fixtures", n));

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/supabase");
  vi.doUnmock("@/lib/storage");
});

const reopen = async (id = "r1") => {
  const { GET } = await import("../app/api/renders/[id]/route");
  return GET(new NextRequest(`http://localhost/api/renders/${id}`), { params: { id } });
};

const row = (over: Partial<StoredRenderRow> = {}): StoredRenderRow => ({
  id: "r1",
  template_snapshot: { engine: "reskin", templateId: "t1", version: 4, templateHash: "h", changeLog: [] },
  parsed_content: { summary: "s", careerHighlights: [], experience: [], competencies: [] },
  coverage: { totalLines: 3, present: 3, missing: [], percent: 100 },
  output_file_path: "renders/1-out.docx",
  submitted_at: null,
  ...over,
});

describe("GET /api/renders/[id] — a stored render reopens with its own record", () => {
  /**
   * The point of TEC-64: what the screen shows after a reload is what the
   * render recorded when it ran. Run a real reformat, keep what it wrote, and
   * reopen it from exactly that — coverage, change log and verdict must match
   * the answer the reformat itself gave.
   */
  it("round-trips a real reformat: same coverage, same change log, same verdict", async () => {
    let insertedRow: Record<string, unknown> | null = null;
    const stored = new Map<string, Buffer>();
    const { client } = fakeSupabase({
      "templates.select": {
        data: { id: "t1", version: 4, name: "template.docx", file_path: "templates/4.docx" },
        error: null,
      },
      "renders.insert": (call) => {
        insertedRow = call.payload as Record<string, unknown>;
        return { data: { id: "r1" }, error: null };
      },
    });
    mockModules({
      resume: client,
      download: async () => fixture("template-flat-sample.docx"),
      upload: async (prefix, _name, bytes) => {
        const path = `${prefix}/1-x.docx`;
        stored.set(path, bytes as Buffer);
        return path;
      },
    });
    const body = new FormData();
    body.append("source", new File([new Uint8Array(fixture("jobright-sample.docx"))], "jobright.docx"));
    const { POST } = await import("../app/api/reformat/route");
    const fresh = await (await POST(new NextRequest("http://localhost/api/reformat", { method: "POST", body }))).json();
    expect(insertedRow).not.toBeNull();
    // Not vacuous: there is a real log and real coverage to carry back.
    expect(fresh.changeLog.length).toBeGreaterThan(0);
    expect(fresh.coverage.totalLines).toBeGreaterThan(0);

    vi.resetModules();
    const saved = insertedRow as unknown as Record<string, unknown>;
    const { client: reader } = fakeSupabase({
      "renders.select": { data: { id: "r1", thread_id: null, submitted_at: null, ...saved }, error: null },
      "templates.select": { data: { name: "template.docx", version: 4 }, error: null },
    });
    const uploads: unknown[] = [];
    mockModules({
      resume: reader,
      download: async (path) => stored.get(path as string) as Buffer,
      upload: async (...args) => {
        uploads.push(args);
        return "never";
      },
    });

    const res = await reopen();
    expect(res.status).toBe(200);
    const back = await res.json();

    expect(back.coverage).toEqual(fresh.coverage);
    expect(back.changeLog).toEqual(fresh.changeLog);
    expect(back.findings).toEqual(fresh.findings);
    expect(back.unread).toEqual([]);
    expect(back.templateLabel).toBe(fresh.templateLabel);
    expect(verdictFor(back)).toEqual(verdictFor(fresh));
    // Reopening reads; it never renders or writes anything again.
    expect(uploads).toEqual([]);
    expect(back.docxBase64).toBeUndefined();
    expect(back.downloadHref).toBe("/api/renders/r1/file");
  });

  it("says where it was logged, so the screen does not offer to log it twice", async () => {
    const { client } = fakeSupabase({
      "renders.select": { data: { ...row(), template_id: "t1", thread_id: "th1" }, error: null },
      "templates.select": { data: { name: "template.docx", version: 4 }, error: null },
    });
    const { client: tracker } = fakeSupabase({
      "pipeline_threads.select": { data: { company: "Northwind" }, error: null },
    });
    mockModules({ resume: client, tracker, download: async () => fixture("template-flat-sample.docx") });
    const back = await (await reopen()).json();
    expect(back.loggedTo).toBe("Northwind");
  });

  it("reports a failed tracker read instead of showing the render as never logged", async () => {
    const { client } = fakeSupabase({
      "renders.select": { data: { ...row(), template_id: null, thread_id: "th1" }, error: null },
    });
    const { client: tracker } = fakeSupabase({
      "pipeline_threads.select": { data: null, error: { message: "permission denied" } },
    });
    mockModules({ resume: client, tracker, download: async () => fixture("template-flat-sample.docx") });
    const res = await reopen();
    expect(res.status).toBe(502);
  });

  it("404s an unknown render and 409s one with no stored output", async () => {
    const missing = fakeSupabase({ "renders.select": { data: null, error: null } });
    mockModules({ resume: missing.client });
    expect((await reopen()).status).toBe(404);

    vi.resetModules();
    const noFile = fakeSupabase({
      "renders.select": { data: { ...row({ output_file_path: null }), template_id: null, thread_id: null }, error: null },
    });
    mockModules({ resume: noFile.client });
    expect((await reopen()).status).toBe(409);
  });
});

describe("storedRenderView — an unread record never reads as a clean one", () => {
  const view = (render: StoredRenderRow, template: { name: string; version: number } | null = null) =>
    storedRenderView({ render, template, findings: [], loggedTo: null });

  it("gives a complete record no unread reasons", () => {
    const v = view(row(), { name: "template.docx", version: 4 });
    expect(v.unread).toEqual([]);
    expect(v.templateLabel).toBe("template.docx (v4)");
  });

  /**
   * A render stored before the change log was kept has nothing to vote with.
   * An empty log would make the verdict PASS; null plus a reason makes it none.
   */
  it("nulls a missing change log and says why", () => {
    const v = view(row({ template_snapshot: { engine: "reskin", version: 4 } }));
    expect(v.changeLog).toBeNull();
    expect(v.unread.join(" ")).toMatch(/No change log/);
  });

  it("nulls a coverage it cannot read and says why", () => {
    const v = view(row({ coverage: { percent: 100 } }));
    expect(v.coverage).toBeNull();
    expect(v.unread.join(" ")).toMatch(/No coverage/);
  });

  /**
   * `trimmed-surplus` was one action for two events until TEC-31 split it — a
   * template trim and a source loss. A log that still carries it cannot say
   * which happened, so reading it as a note would pass a render that lost text.
   */
  it("refuses a verdict on a change log with an action it no longer weighs", () => {
    const v = view(
      row({
        template_snapshot: {
          version: 4,
          changeLog: [{ section: "Professional Experience", detail: "x", action: "trimmed-surplus" }],
        },
      })
    );
    expect(v.changeLog).toHaveLength(1);
    expect(v.unread.join(" ")).toMatch(/trimmed-surplus/);
  });

  it("names the template from the render's own snapshot once the template is deleted", () => {
    expect(view(row()).templateLabel).toBe("a deleted template (v4)");
  });
});
