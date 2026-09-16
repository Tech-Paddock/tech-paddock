import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import JSZip from "jszip";
import { fakeSupabase, mockModules } from "./helpers/fakeSupabase";

const fixture = (n: string) => readFileSync(join(__dirname, "fixtures", n));
const reformat = () => {
  const body = new FormData();
  body.append("source", new File([new Uint8Array(fixture("jobright-sample.docx"))], "jobright.docx"));
  return new NextRequest("http://localhost/api/reformat", { method: "POST", body });
};

const activeRow = (over: Record<string, unknown> = {}) => ({
  "templates.select": {
    data: { id: "t1", version: 4, name: "template.docx", file_path: "templates/4.docx", ...over },
    error: null,
  },
  "renders.insert": { data: { id: "r1" }, error: null },
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/supabase");
  vi.doUnmock("@/lib/storage");
});

/**
 * The template file is the substrate the render is built on, not a description
 * of one that the app keeps a copy of.
 *
 * That is the whole reason the output keeps the template's page size, styles,
 * numbering and theme: they are never read, so they cannot be read wrongly. It
 * also means there is nothing to fall back to. The renderer this replaced held a
 * seventeen-field summary of the template and would quietly render from a stale
 * copy of it when the file could not be read — which produced a document that
 * looked wrong for a reason nothing on screen explained.
 */
describe("the render is built from the template file", () => {
  it("reads the active template's stored bytes", async () => {
    const { client } = fakeSupabase(activeRow());
    const asked: unknown[] = [];
    mockModules({
      resume: client,
      download: async (path) => {
        asked.push(path);
        return fixture("template-sample.docx");
      },
    });

    const { POST } = await import("../app/api/reformat/route");
    const res = await POST(reformat());

    expect(res.status).toBe(200);
    expect(asked).toEqual(["templates/4.docx"]);
    expect((await res.json()).templateLabel).toContain("v4");
  });

  it("carries that file's own parts into the output untouched", async () => {
    const { client } = fakeSupabase(activeRow());
    mockModules({ resume: client, download: async () => fixture("template-sample.docx") });

    const { POST } = await import("../app/api/reformat/route");
    const body = await (await POST(reformat())).json();

    const out = await JSZip.loadAsync(Buffer.from(body.docxBase64, "base64"));
    const template = await JSZip.loadAsync(fixture("template-sample.docx"));
    for (const part of ["word/styles.xml", "word/numbering.xml", "word/theme/theme1.xml"]) {
      expect(await out.file(part)?.async("string"), part).toBe(await template.file(part)?.async("string"));
    }
  });

  // No file, no substrate, no render. Saying so beats producing a document that
  // is quietly formatted like something else.
  it("refuses rather than rendering when the row has no file", async () => {
    const { client } = fakeSupabase(activeRow({ file_path: null }));
    mockModules({ resume: client });

    const { POST } = await import("../app/api/reformat/route");
    const res = await POST(reformat());

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("no_template_file");
    expect(body.error).toMatch(/Templates tab/);
  });

  it("surfaces a storage failure rather than substituting anything for it", async () => {
    const { client } = fakeSupabase(activeRow());
    mockModules({
      resume: client,
      // Imported here rather than at the top of the file: a StorageError taken
      // before the mock is a different class object, so the route's `instanceof`
      // misses it and the 502 comes back as a 500.
      download: async () => {
        const { StorageError } = await import("@/lib/storage");
        throw new StorageError("bucket unreachable");
      },
    });

    const { POST } = await import("../app/api/reformat/route");
    const res = await POST(reformat());

    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("storage_error");
  });

  it("reports stored bytes that are not a readable docx, rather than rendering something else", async () => {
    const { client } = fakeSupabase(activeRow());
    mockModules({ resume: client, download: async () => Buffer.from("not a zip") });

    const { POST } = await import("../app/api/reformat/route");
    const res = await POST(reformat());

    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/template/i);
  });

  it("still takes a one-off template straight from the upload, and saves nothing", async () => {
    const { client, calls } = fakeSupabase(activeRow());
    mockModules({ resume: client, download: async () => fixture("template-sample.docx") });

    const body = new FormData();
    body.append("source", new File([new Uint8Array(fixture("jobright-sample.docx"))], "jobright.docx"));
    body.append("template", new File([new Uint8Array(fixture("template-sample.docx"))], "one-off.docx"));

    const { POST } = await import("../app/api/reformat/route");
    const res = await POST(new NextRequest("http://localhost/api/reformat", { method: "POST", body }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.templateLabel).toContain("one-off");
    expect(json.renderId).toBeNull();
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });
});
