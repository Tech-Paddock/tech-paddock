import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readDocxParts } from "../lib/docx/read";
import { fakeSupabase, mockModules } from "./helpers/fakeSupabase";
import { makeDocx } from "./helpers/docx";

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
    // The flat template audits clean. The older one carries two blocking
    // findings, so its render FAILs and returns no document (pinned below).
    withStoredTemplate("template-flat-sample.docx");
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
    expect(body.findings).toEqual([]);
    expect(body.verdict.pass).toBe(true);
    const parts = await readDocxParts(Buffer.from(body.docxBase64, "base64"));
    expect(parts.document).toContain("Professional Experience");
  });

  /**
   * TEC-105. Joel, 2026-10-14: "block the download but give the specific issue
   * in diagnostic". A FAIL hands out no bytes — not in the response, and not in
   * storage, where the Resumes list or `/api/renders/[id]/file` could offer them
   * later. The record of the render is still kept, because it is what says why.
   */
  it("returns and stores no document when the verdict is FAIL, but records the render", async () => {
    const uploads: string[] = [];
    const { client, calls } = fakeSupabase(activeTemplate());
    mockModules({
      resume: client,
      download: async () => fixture("template-sample.docx"),
      upload: async (prefix) => {
        uploads.push(String(prefix));
        return `${prefix}/x.docx`;
      },
    });
    const res = await reformat({ source: file("jobright.docx", fixture("jobright-sample.docx")) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.verdict.pass).toBe(false);
    expect(body.verdict.reasons.length).toBeGreaterThan(0);
    expect(body).not.toHaveProperty("docxBase64");
    expect(uploads).toEqual(["sources"]);
    const payload = calls.find((c) => c.op === "insert")?.payload as Record<string, unknown>;
    expect(payload.output_file_path).toBeNull();
    expect(payload.source_file_path).toBe("sources/x.docx");
    expect(body.renderId).toBe("r1");
  });

  /**
   * TEC-105, Joel 2026-10-18: a template section the source does not fill — a
   * Summary the Jobright export lacks — "only warns". The render PASSes, says
   * so in a note, and hands out and stores its file like any other PASS. Source
   * text with no slot is a different case and still blocks (pinned above and in
   * `tests/feather.test.ts`).
   */
  it("passes with a warning and returns the file when the template has a Summary the source does not fill", async () => {
    const uploads: string[] = [];
    const { client, calls } = fakeSupabase(activeTemplate());
    mockModules({
      resume: client,
      download: async () => fixture("template-flat-sample.docx"),
      upload: async (prefix) => {
        uploads.push(String(prefix));
        return `${prefix}/x.docx`;
      },
    });
    const H = '<w:rPr><w:b/><w:sz w:val="22"/></w:rPr>';
    const p = (text: string, rPr = "", pPr = "") =>
      `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
    const BULLET = '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>';
    const noSummary = await makeDocx({
      body: [
        p("Avery Example", '<w:rPr><w:sz w:val="40"/></w:rPr>'),
        p("Professional Experience", H),
        `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Fabrikam Logistics</w:t></w:r><w:r><w:tab/></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Jan 2021 - Present</w:t></w:r></w:p>`,
        p("Operations Manager", "<w:rPr><w:i/></w:rPr>"),
        p("Cut a representative cycle time by an invented margin.", "", BULLET),
        p("Core Competencies", H),
        p("Systems: Alpha, Beta, Gamma"),
      ].join(""),
    });

    const res = await reformat({ source: file("jobright.docx", noSummary) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.changeLog).toContainEqual(expect.objectContaining({ section: "Summary", action: "not-found-in-input" }));
    expect(body.coverage.missing).toEqual([]);
    expect(body.verdict.pass).toBe(true);
    expect(body.verdict.reasons).toEqual([]);
    expect(body.verdict.notes).toContainEqual(expect.stringMatching(/did not fill .*Summary/));

    // A file, in the response and in storage.
    const parts = await readDocxParts(Buffer.from(body.docxBase64, "base64"));
    expect(parts.document).toContain("Fabrikam Logistics");
    expect(uploads).toEqual(["sources", "renders"]);
    const payload = calls.find((c) => c.op === "insert")?.payload as Record<string, unknown>;
    expect(payload.output_file_path).toBe("renders/x.docx");
  });

  /**
   * TEC-105, Joel 2026-10-18: "Whole sections only." A source with fewer Career
   * Highlights than the template has cells fills the section only in part, so
   * the remaining cells would ship the template's own figures. That FAILs: no
   * file in the response and none in storage, though the render is recorded.
   */
  it("fails, and returns and stores no document, when the source has fewer Career Highlights than the template", async () => {
    const uploads: string[] = [];
    const { client, calls } = fakeSupabase(activeTemplate());
    mockModules({
      resume: client,
      download: async () => fixture("template-flat-sample.docx"),
      upload: async (prefix) => {
        uploads.push(String(prefix));
        return `${prefix}/x.docx`;
      },
    });
    const H = '<w:rPr><w:b/><w:sz w:val="22"/></w:rPr>';
    const p = (text: string, rPr = "", pPr = "") =>
      `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
    const BULLET = '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>';
    const oneHighlight = await makeDocx({
      body: [
        p("Avery Example", '<w:rPr><w:sz w:val="40"/></w:rPr>'),
        p("Summary", H),
        p("Operations lead with a representative record of invented outcomes across several sample teams."),
        p("Career Highlights", H),
        p("| 40% |"),
        p("| :--- |"),
        p("| Cut a representative invented cost. |"),
        p("Professional Experience", H),
        `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Fabrikam Logistics</w:t></w:r><w:r><w:tab/></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Jan 2021 - Present</w:t></w:r></w:p>`,
        p("Operations Manager", "<w:rPr><w:i/></w:rPr>"),
        p("Cut a representative cycle time by an invented margin.", "", BULLET),
        p("Core Competencies", H),
        p("Systems: Alpha, Beta, Gamma"),
      ].join(""),
    });

    const res = await reformat({ source: file("jobright.docx", oneHighlight) });
    expect(res.status).toBe(200);
    const body = await res.json();

    // The source's one highlight was read and placed; the template's other
    // cells keep their own figures.
    const kept = body.changeLog.filter(
      (c: { section: string; action: string }) => c.section === "Career Highlights" && c.action === "not-found-in-input"
    );
    expect(kept.length).toBeGreaterThan(0);
    expect(body.coverage.missing).toEqual([]);
    expect(body.verdict.pass).toBe(false);
    expect(body.verdict.reasons).toContainEqual(expect.stringMatching(/filled Career Highlights only in part/));

    expect(body).not.toHaveProperty("docxBase64");
    expect(uploads).toEqual(["sources"]);
    const payload = calls.find((c) => c.op === "insert")?.payload as Record<string, unknown>;
    expect(payload.output_file_path).toBeNull();
    expect(body.renderId).toBe("r1");
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
