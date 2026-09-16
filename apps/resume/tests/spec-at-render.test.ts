import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import JSZip from "jszip";
import { fakeSupabase, mockModules } from "./helpers/fakeSupabase";
import { makeDocx, para, runs, stylesWithDefaults, table } from "./helpers/docx";

/**
 * Where a render's formatting comes from.
 *
 * It used to come from `resume.templates.spec`, written once at upload by
 * whichever release was running then. So every change to what a spec can express
 * did nothing until the template was uploaded again by hand, with nothing anywhere
 * saying so — three times in one week the answer to "why didn't that work" was a
 * re-upload. Now the stored `.docx` is read and the spec extracted from it, which
 * is the file that *is* the template.
 *
 * These tests are about which source won and whether the caller was told. The
 * database double covers branch selection, not SQL.
 */

const ACCENT = "1F3864";
const GREY = "666666";
const NEAR_BLACK = "1A1A1A";

/** A template whose colours and sizes are nothing like the stale spec below, so
 *  which one was used is visible in the output rather than inferred. */
const colourfulTemplate = () =>
  makeDocx({
    styles: stylesWithDefaults(NEAR_BLACK, 21),
    body: [
      runs([{ text: "Alex Placeholder", sz: 40, color: ACCENT, bold: true }]),
      runs([{ text: "alex@example.invalid  ·  555-0100", sz: 20, color: GREY }]),
      runs([{ text: "Career Highlights", sz: 22, color: ACCENT, bold: true }]),
      table([
        [
          runs([{ text: "$250,000", sz: 25, color: ACCENT, bold: true }]),
          runs([{ text: "Annual savings through automation", sz: 18, color: "444444" }]),
        ],
      ]),
      runs([{ text: "Professional Experience", sz: 22, color: ACCENT, bold: true }]),
      runs([
        { text: "Fabrikam", sz: 22, bold: true },
        { text: "   Senior Consultant", color: GREY, italic: true },
        { text: "Jan 2024 – Present", sz: 20, color: GREY },
      ]),
      para("Did a measurable thing.", undefined, { list: true }),
    ].join(""),
  });

const sourceDocx = () =>
  makeDocx({
    body: [
      para("Alex Placeholder", 50),
      para("alex@example.invalid | 555-0100", 18),
      para("Professional Experience", 22),
      para("Contoso Cloud   Analyst   Jan 2024 - Present", 21),
      para("Delivered a measurable thing.", 20, { list: true }),
    ].join(""),
  });

/**
 * A spec of the kind actually sitting on the rows today: written before the colour
 * fields existed, so every colour in it is absent and the sizes are the old ranked
 * guesses. If this is what renders, the output is black — which is the bug.
 */
const STALE_SPEC = {
  font: "Times New Roman",
  bodySize: 9,
  headingSize: 9,
  nameSize: 9,
  contactSize: 9,
  entrySize: 9,
  headingBold: false,
  headingColor: null,
  nameColor: null,
  margins: { top: 1, right: 1, bottom: 1, left: 1 },
  spacing: { before: 40, after: 40, line: null },
  bulletGlyph: "•",
  highlightsStyle: "table",
};

const ACTIVE = { id: "t1", version: 4, name: "house-style.docx", spec: STALE_SPEC, file_path: "templates/4.docx" };

beforeEach(() => vi.resetModules());
afterEach(() => vi.doUnmock("@/lib/supabase"));

const request = async (fields: { source: Buffer; template?: Buffer }) => {
  const body = new FormData();
  body.append("source", new File([new Uint8Array(fields.source)], "jobright.docx"));
  if (fields.template) body.append("template", new File([new Uint8Array(fields.template)], "one-off.docx"));
  return new NextRequest("http://localhost/api/reformat", { method: "POST", body });
};

/** A built .docx is a zip, so its parts have to be inflated before anything can
 *  be asserted about them — the compressed bytes contain none of the strings. */
async function partsOf(base64: string) {
  const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"));
  return {
    document: await zip.file("word/document.xml")!.async("string"),
    styles: await zip.file("word/styles.xml")!.async("string"),
  };
}

/** The route, with the active template's bytes served by `download`.
 *
 *  One call per test. `vi.resetModules()` runs in `beforeEach`, so a second call
 *  inside the same test gets the cached route module still holding the first
 *  call's mocked client — the assertions then read an empty array and the reason
 *  is not obvious from the failure. */
async function reformat(opts: {
  row?: Record<string, unknown> | null;
  download?: () => Promise<Buffer>;
  template?: Buffer;
}) {
  const inserted: Record<string, unknown>[] = [];
  const { client, calls } = fakeSupabase({
    "templates.select": { data: opts.row === undefined ? ACTIVE : opts.row, error: null },
    "renders.insert": (call) => {
      inserted.push(call.payload as Record<string, unknown>);
      return { data: { id: "r1" }, error: null };
    },
  });
  mockModules({
    resume: client,
    download: opts.download ?? (async () => colourfulTemplate()),
    upload: async (prefix) => `${prefix}/x.docx`,
  });

  const { POST } = await import("@/app/api/reformat/route");
  const res = await POST(await request({ source: await sourceDocx(), template: opts.template }));
  return { res, body: await res.json(), inserted, calls };
}

describe("the spec comes from the template file", () => {
  it("renders from the file, not from the spec stored at upload", async () => {
    const { res, body } = await reformat({});

    expect(res.status).toBe(200);
    expect(body.specSource).toBe("file");
    expect(body.specNote).toBeNull();

    // Neither of these is in the stale spec: it has no colours at all and asks
    // for Times New Roman.
    const parts = await partsOf(body.docxBase64);
    expect(parts.document).toContain(`w:val="${ACCENT}"`);
    expect(parts.styles).toContain("Calibri");
    expect(parts.styles).not.toContain("Times New Roman");
  });

  // The whole point of the change: the colour work shipped and did nothing until
  // the template was uploaded again. A stale row must no longer be able to do that.
  it("gives an old row the file's colours without it being re-uploaded", async () => {
    const { body, inserted } = await reformat({});

    expect(body.specSource).toBe("file");
    const spec = inserted[0].template_snapshot as {
      nameColor: string | null;
      defaultColor: string | null;
      entry: { title: { size: number | null; color: string | null } };
    };
    expect(spec.nameColor).toBe(ACCENT);
    expect(spec.defaultColor).toBe(NEAR_BLACK);
    // 10.5pt, inherited from the template's docDefaults and stated on no run.
    expect(spec.entry.title).toMatchObject({ size: 10.5, color: GREY });
  });

  // Reproducibility is the property this change had to not break, and the schema
  // is what provides it: template_snapshot is "the spec as it was at render time".
  it("records the spec it actually used on the render", async () => {
    const { inserted } = await reformat({});
    const spec = inserted[0].template_snapshot as { font: string; nameSize: number };

    expect(inserted).toHaveLength(1);
    expect(spec.font).toBe("Calibri");
    expect(spec.nameSize).toBe(20);
    // Not the row's copy — that is the thing no longer trusted.
    expect(spec.font).not.toBe(STALE_SPEC.font);
  });

  it("reads the file rather than the row even when both are available", async () => {
    let downloaded = 0;
    await reformat({
      download: async () => {
        downloaded += 1;
        return colourfulTemplate();
      },
    });
    expect(downloaded).toBe(1);
  });
});

describe("when the template file cannot be read", () => {
  // The stored spec is not a guess — it was extracted from these same bytes — so
  // a storage blip should not block a render going to an employer tonight. But an
  // invisible fallback is how "the fix didn't work" happened three times, so it is
  // always said out loud.
  it("falls back to the stored spec and says so", async () => {
    const { res, body } = await reformat({
      download: async () => {
        const { StorageError } = await import("@/lib/storage");
        throw new StorageError("bucket unreachable");
      },
    });

    expect(res.status).toBe(200);
    expect(body.specSource).toBe("stored");
    expect(body.specNote).toContain("may be older than the file");
    expect(body.specNote).toContain("bucket unreachable");
  });

  it("falls back when the stored bytes are not a readable docx", async () => {
    const { res, body } = await reformat({ download: async () => Buffer.from("this is not a zip") });

    expect(res.status).toBe(200);
    expect(body.specSource).toBe("stored");
    expect(body.specNote).toContain("readable .docx");
  });

  it("falls back, with its own reason, when the row has no file at all", async () => {
    const { res, body } = await reformat({ row: { ...ACTIVE, file_path: null } });

    expect(res.status).toBe(200);
    expect(body.specSource).toBe("stored");
    expect(body.specNote).toContain("no stored file");
  });

  // A normalized stale spec still renders, which is what makes the fallback worth
  // having rather than a slower way to fail.
  it("still produces a document when it falls back", async () => {
    const { body } = await reformat({ row: { ...ACTIVE, file_path: null } });
    expect(Buffer.from(body.docxBase64, "base64").byteLength).toBeGreaterThan(0);
    expect(body.coverage.percent).toBe(100);
  });

  // Only the two failures that mean "those bytes were no use" are caught. A
  // programming error must not be laundered into a quietly-degraded render.
  it("does not swallow an error that is neither storage nor a bad docx", async () => {
    const { res, body } = await reformat({
      download: async () => {
        throw new TypeError("undefined is not a function");
      },
    });

    expect(res.status).toBe(500);
    expect(body.code).toBe("reformat_failed");
  });
});

describe("a one-off template", () => {
  // Unchanged by this: it always re-extracted, which is why it was the way to test
  // a template before committing it to a version.
  it("is still read straight from the upload, and saves nothing", async () => {
    const { res, body, inserted } = await reformat({ template: await colourfulTemplate() });

    expect(res.status).toBe(200);
    expect(body.specSource).toBe("file");
    expect(body.templateLabel).toContain("one-off");
    expect(body.renderId).toBeNull();
    expect(inserted).toEqual([]);
  });

  it("never touches the database for it", async () => {
    const { calls } = await reformat({ template: await colourfulTemplate() });
    expect(calls).toEqual([]);
  });
});
