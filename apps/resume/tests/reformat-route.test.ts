import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readDocxParts } from "../lib/docx/read";
import { fakeSupabase, mockModules } from "./helpers/fakeSupabase";

const fixture = (n: string) => readFileSync(join(__dirname, "fixtures", n));
const file = (name: string, bytes: Buffer) => new File([new Uint8Array(bytes)], name);

function request(fields: Record<string, File | undefined>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v) body.append(k, v);
  return new NextRequest("http://localhost/api/reformat", { method: "POST", body });
}

/**
 * **Every render is against the stored active template.** This file used to pass
 * the template in the request and so never touched the database at all — the
 * one-off path made that possible. It is removed, so these mock what a render
 * actually does.
 */
const activeTemplate = () => ({
  "templates.select": {
    data: { id: "t1", version: 4, name: "template.docx", file_path: "templates/4.docx" },
    error: null,
  },
  "renders.insert": { data: { id: "r1" }, error: null },
});

const withStoredTemplate = (name = "template-sample.docx") => {
  const { client, calls } = fakeSupabase(activeTemplate());
  mockModules({ resume: client, download: async () => fixture(name), upload: async (p) => `${p}/x.docx` });
  return { calls };
};

const reformat = async (fields: Record<string, File | undefined>) => {
  const { POST } = await import("../app/api/reformat/route");
  return POST(request(fields));
};

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/supabase");
  vi.doUnmock("@/lib/storage");
});

describe("POST /api/reformat", () => {
  it("returns a document, full coverage, and a clean ATS result", async () => {
    withStoredTemplate();
    const res = await reformat({ source: file("jobright.docx", fixture("jobright-sample.docx")) });
    expect(res.status).toBe(200);
    const body = await res.json();

    // Everything the engine took out of the source reached the document. The
    // name, the contact block and the static sections are not in that set — they
    // come from the template on purpose — so this is the question worth asking
    // rather than "is all of the source in there".
    expect(body.coverage.percent).toBe(100);
    expect(body.coverage.missing).toEqual([]);
    expect(body.filename).toBe("jobright (reformatted).docx");

    // The payload really is a readable docx carrying the source's content.
    const parts = await readDocxParts(Buffer.from(body.docxBase64, "base64"));
    expect(parts.document).toContain("Professional Experience");
  });

  /**
   * The renderer that came before this one rebuilt the document to the ATS rules
   * and so always passed its own lint — while getting the page size, the
   * alignment and the bullets wrong. This one keeps the template exactly,
   * **including the template's own ATS problems**, and reports them.
   *
   * That is the lint doing its job rather than failing at it: the finding is
   * real, it is about the template, and the fix is in the template. A render
   * that quietly passed a check it had rebuilt itself to satisfy told nobody
   * anything.
   */
  it("reports the template's own ATS problems rather than rebuilding them away", async () => {
    withStoredTemplate();
    const res = await reformat({ source: file("jobright.docx", fixture("jobright-sample.docx")) });
    const { findings } = await res.json();
    const codes = findings.map((f: { code: string }) => f.code);
    // The fixture template has a second table and a content control; both
    // survive into the output because nothing rewrites them away.
    expect(codes).toContain("too_many_tables");
    expect(codes).toContain("content_control");
  });

  it("reports the jobs it mapped in", async () => {
    withStoredTemplate();
    const res = await reformat({ source: file("jobright.docx", fixture("jobright-sample.docx")) });
    const { summary, changeLog } = await res.json();
    expect(summary.experience).toHaveLength(5);
    expect(summary.experience[0]).toMatchObject({ company: "Northwind Athletics", title: "Sr. Platform Administrator" });
    expect(summary.competencies).toBe(3);
    expect(changeLog.some((c: { action: string }) => c.action === "passthrough")).toBe(true);
  });

  /**
   * **Every render is recorded — there is no longer a shape that is not.** The
   * one-off path returned a document with `renderId: null`, so every question
   * downstream was conditional: whether it appears in history, whether a job can
   * be attached to it, whether it can be downloaded again. A preview you cannot
   * find again is a worse answer than uploading the template first.
   */
  it("always saves the render, so it can be found again", async () => {
    const { calls } = withStoredTemplate();
    const res = await reformat({ source: file("jobright.docx", fixture("jobright-sample.docx")) });

    const body = await res.json();
    expect(body.renderId).toBe("r1");
    expect(body.templateLabel).toBe("template.docx (v4)");
    expect(calls.find((c) => c.op === "insert")?.payload).toMatchObject({ template_id: "t1" });
  });

  it("refuses rather than rendering when there is no active template", async () => {
    const { client } = fakeSupabase({ "templates.select": { data: null, error: null } });
    mockModules({ resume: client });

    const res = await reformat({ source: file("jobright.docx", fixture("jobright-sample.docx")) });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("no_template");
  });

  it("names the file it is missing", async () => {
    withStoredTemplate();
    const res = await reformat({});
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("no_source");
  });

  it("names the file that is the wrong type", async () => {
    withStoredTemplate();
    const res = await reformat({ source: file("resume.pdf", Buffer.from("%PDF")) });
    expect(res.status).toBe(415);
    expect((await res.json()).error).toContain("resume");
  });

  // A template attached to the request is no longer a path through this route.
  // It is ignored rather than honoured, and the render is the stored one's.
  it("ignores a template attached to the request", async () => {
    withStoredTemplate();
    const res = await reformat({
      source: file("jobright.docx", fixture("jobright-sample.docx")),
      template: file("one-off.docx", fixture("template-flat-sample.docx")),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.templateLabel).toBe("template.docx (v4)");
    expect(body.templateLabel).not.toContain("one-off");
    expect(body.renderId).toBe("r1");
  });
});
