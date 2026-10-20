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

const TEMPLATE = {
  id: "t1",
  version: 4,
  name: "house-style.docx",
  is_active: true,
  archived_at: null,
  created_at: "2026-09-10T00:00:00Z",
};

const RENDER = {
  id: "r1",
  created_at: "2026-09-12T00:00:00Z",
  submitted_at: null,
  coverage: { totalLines: 20, present: 20, missing: [], percent: 100 },
  source_file_path: "sources/1757000000000-export.docx",
  output_file_path: "renders/1757000000000-tailored.docx",
};

beforeEach(() => vi.resetModules());
afterEach(() => vi.doUnmock("@/lib/supabase"));

async function get(tables: Parameters<typeof fakeSupabase>[0]) {
  const { client } = fakeSupabase(tables);
  mockModules({ resume: client });
  const { GET } = await import("@/app/api/resumes/route");
  const res = await GET();
  return { res, body: (await res.json()) as { files?: ResumeFile[]; error?: string } };
}

/** TEC-31. Renders were capped at fifty with nothing saying so. */
describe("how much of the history it returns", () => {
  it("returns every render rather than a silent first fifty", async () => {
    const renders = Array.from({ length: 230 }, (_, i) => ({
      ...RENDER,
      id: `r${i}`,
      created_at: `2026-09-12T00:00:${String(i % 60).padStart(2, "0")}Z`,
    }));
    const { client, calls } = fakeSupabase({
      "templates.select": { data: [], error: null },
      "renders.select": { data: renders, error: null },
    });
    mockModules({ resume: client });
    const { GET } = await import("@/app/api/resumes/route");
    const body = (await (await GET()).json()) as { files: ResumeFile[] };

    expect(calls.find((c) => c.table === "renders")?.filters.some(([k]) => k === "limit")).toBe(false);
    expect(body.files.filter((f) => f.kind === "output")).toHaveLength(230);
  });
});

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
      downloadHref: "/api/templates/t1/file",
      // A template has no coverage, and says so rather than borrowing a
      // render's shape.
      coverage: null,
      submittedAt: null,
    });
    // TEC-63: renders are built from the template's file, never from a summary
    // of it, so the list no longer carries one.
    expect(body.files![0]).not.toHaveProperty("spec");
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

  /** The Pipeline Tracker was retired on 2026-10-20: a file no longer names a job. */
  it("reads no tracker thread and carries no job fields", async () => {
    const { client, calls } = fakeSupabase({
      "templates.select": { data: [TEMPLATE], error: null },
      "renders.select": { data: [RENDER], error: null },
    });
    mockModules({ resume: client });
    const { GET } = await import("@/app/api/resumes/route");
    const body = (await (await GET()).json()) as { files: ResumeFile[] };

    expect(body.files).toHaveLength(3);
    expect(calls.map((c) => c.table)).not.toContain("pipeline_threads");
    for (const f of body.files) {
      expect(f).not.toHaveProperty("company");
      expect(f).not.toHaveProperty("stage");
    }
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
