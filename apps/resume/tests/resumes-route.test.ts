import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, mockModules } from "./helpers/fakeSupabase";
import { fileLabel, sortResumeFiles, type ResumeFile } from "@/lib/resumes";

/**
 * `/api/resumes` — the one list behind the Resume tab.
 *
 * What is worth pinning here is the projection, because it is the only place
 * that decides a render is two files rather than one row. Everything else on
 * that tab is a filter over what this returns, so a mistake here is a mistake
 * on every screen the tab has.
 */

const SPEC = { font: "Calibri", bodySize: 11, headingSize: 11, margins: { left: 1, top: 1 } };

const TEMPLATE = {
  id: "t1",
  version: 4,
  name: "house-style.docx",
  spec: SPEC,
  is_active: true,
  archived_at: null,
  created_at: "2026-09-10T00:00:00Z",
};

const RENDER = {
  id: "r1",
  created_at: "2026-09-12T00:00:00Z",
  submitted_at: null,
  thread_id: null,
  coverage: { totalLines: 20, present: 20, missing: [], percent: 100 },
  source_file_path: "sources/1757000000000-export.docx",
  output_file_path: "renders/1757000000000-tailored.docx",
};

beforeEach(() => vi.resetModules());
afterEach(() => vi.doUnmock("@/lib/supabase"));

async function get(tables: Parameters<typeof fakeSupabase>[0], tracker?: unknown) {
  const { client } = fakeSupabase(tables);
  mockModules({ resume: client, tracker: tracker ?? fakeSupabase({}).client });
  const { GET } = await import("@/app/api/resumes/route");
  const res = await GET();
  return { res, body: (await res.json()) as { files?: ResumeFile[]; error?: string } };
}

describe("the merged list", () => {
  it("gives a render two rows — what went in and what came out — sharing the render's id", async () => {
    const { res, body } = await get({
      "templates.select": { data: [TEMPLATE], error: null },
      "renders.select": { data: [RENDER], error: null },
    });

    expect(res.status).toBe(200);
    expect(body.files?.map((f) => f.kind)).toEqual(["output", "input", "template"]);

    const [output, input] = body.files!;
    // Both are the same render, which is why deleting either takes both files.
    expect(output.id).toBe("r1");
    expect(input.id).toBe("r1");
    expect(output.key).not.toBe(input.key);
    expect(output.downloadHref).toBe("/api/renders/r1/file");
    expect(input.downloadHref).toBe("/api/renders/r1/source");
  });

  it("carries the template's own fields and nothing a template does not have", async () => {
    const { body } = await get({
      "templates.select": { data: [TEMPLATE], error: null },
      "renders.select": { data: [], error: null },
    });

    expect(body.files).toHaveLength(1);
    expect(body.files![0]).toMatchObject({
      kind: "template",
      id: "t1",
      name: "house-style.docx",
      version: 4,
      active: true,
      archived: false,
      spec: SPEC,
      downloadHref: "/api/templates/t1/file",
      // A template has no job and no coverage, and says so rather than borrowing
      // a render's shape.
      company: null,
      coverage: null,
      submittedAt: null,
    });
  });

  /**
   * The old Templates tab asked for archived rows in a second request, so the
   * two lists could disagree about what existed. One request, filtered on the
   * client, cannot.
   */
  it("includes archived templates rather than hiding them behind a second request", async () => {
    const { body } = await get({
      "templates.select": {
        data: [TEMPLATE, { ...TEMPLATE, id: "t0", version: 3, is_active: false, archived_at: "2026-09-11T00:00:00Z" }],
        error: null,
      },
      "renders.select": { data: [], error: null },
    });

    expect(body.files?.map((f) => f.archived)).toEqual(expect.arrayContaining([true, false]));
  });

  /** A row whose only action is a download that 404s is worse than an absence. */
  it("contributes no rows for a render with neither file stored", async () => {
    const { body } = await get({
      "templates.select": { data: [], error: null },
      "renders.select": {
        data: [{ ...RENDER, source_file_path: null, output_file_path: null }],
        error: null,
      },
    });

    expect(body.files).toEqual([]);
  });

  it("joins the job from the tracker thread", async () => {
    const { client: tracker } = fakeSupabase({
      "pipeline_threads.select": { data: [{ id: "th1", company: "Northwind", stage: "Applied" }], error: null },
    });
    const { body } = await get(
      {
        "templates.select": { data: [], error: null },
        "renders.select": { data: [{ ...RENDER, thread_id: "th1" }], error: null },
      },
      tracker
    );

    expect(body.files?.map((f) => f.company)).toEqual(["Northwind", "Northwind"]);
    expect(body.files?.[0].stage).toBe("Applied");
  });

  /**
   * Swallowing this would render every row as "no job recorded", which looks
   * like missing data rather than a broken cross-schema read. Same call as
   * `/api/renders` makes, and deliberately the same answer.
   */
  it("reports a broken tracker read rather than showing every row as jobless", async () => {
    const { client: tracker } = fakeSupabase({
      "pipeline_threads.select": { data: null, error: { message: "permission denied" } },
    });
    const { res, body } = await get(
      {
        "templates.select": { data: [], error: null },
        "renders.select": { data: [{ ...RENDER, thread_id: "th1" }], error: null },
      },
      tracker
    );

    expect(res.status).toBe(502);
    expect(body.files).toBeUndefined();
  });
});

describe("what a stored file is called", () => {
  it("drops the epoch storage keys carry and keeps the name", () => {
    expect(fileLabel("renders/1757000000000-tailored.docx", "x.docx")).toBe("tailored.docx");
  });

  /** Ten digits is the floor so a slug starting with a year keeps its prefix. */
  it("leaves a name that merely starts with a year alone", () => {
    expect(fileLabel("renders/2026-analyst.docx", "x.docx")).toBe("2026-analyst.docx");
  });

  it("falls back when there is no path at all", () => {
    expect(fileLabel(null, "resume.docx")).toBe("resume.docx");
  });
});

describe("the order files are listed in", () => {
  it("is newest first, and within one moment the template, then the output, then the input", () => {
    const at = (kind: ResumeFile["kind"], createdAt: string): ResumeFile => ({
      key: `${kind}:${createdAt}`,
      kind,
      id: "x",
      name: "f.docx",
      createdAt,
      downloadHref: "/x",
      version: null,
      active: false,
      archived: false,
      spec: null,
      company: null,
      stage: null,
      coverage: null,
      submittedAt: null,
    });

    const sorted = sortResumeFiles([
      at("input", "2026-09-12T00:00:00Z"),
      at("template", "2026-09-01T00:00:00Z"),
      at("output", "2026-09-12T00:00:00Z"),
      at("template", "2026-09-12T00:00:00Z"),
    ]);

    expect(sorted.map((f) => `${f.kind}@${f.createdAt.slice(8, 10)}`)).toEqual([
      "template@12",
      "output@12",
      "input@12",
      "template@01",
    ]);
  });
});
