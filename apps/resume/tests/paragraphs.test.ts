import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readDocxParts, inflatedBytes, MAX_INFLATED_BYTES, DocxReadError } from "../lib/docx/read";
import { loadDocx } from "../lib/reskin/container";
import { extractParagraphs } from "../lib/docx/paragraphs";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name));
const load = async (name: string) => extractParagraphs((await readDocxParts(fixture(name))).document);

/**
 * `<w:tab>` means two different things depending on its parent. Inside a run it
 * is a tab character; inside `<w:pPr><w:tabs>` it *declares a tab stop* and no
 * text exists at all. Walking the whole paragraph for text conflated them, so
 * every paragraph that positioned anything came out with a leading tab this app
 * had invented — in the one function whose contract is that it never invents
 * text.
 *
 * It looked harmless because `<w:pPr>` precedes its runs, so the fake tab always
 * landed where `.trim()` removed it. The real tabs, the ones separating a date
 * from a job title, are interior and must survive.
 */
describe("tab stops are not tab characters", () => {
  it("does not prepend a tab to a heading that declares one", async () => {
    const paras = await load("template-flat-sample.docx");
    const heading = paras.find((p) => p.text.includes("Professional Experience"))!;
    expect(heading.text.startsWith("\t")).toBe(false);
    expect(heading.text.trim()).toBe("Professional Experience");
  });

  it("keeps the real tab that sets a date against its right stop", async () => {
    const paras = await load("template-flat-sample.docx");
    const entry = paras.find((p) => p.text.includes("Lakeside Systems"))!;
    expect(entry.text).toContain("\tJan 2026 - Present");
    expect(entry.text.startsWith("\t")).toBe(false);
  });

  it("leaves a competency row with exactly the one tab between label and items", async () => {
    const paras = await load("template-flat-sample.docx");
    const row = paras.find((p) => p.text.includes("Systems:"))!;
    expect((row.text.match(/\t/g) ?? []).length).toBe(1);
    expect(row.text.startsWith("Systems:\t")).toBe(true);
  });
});

describe("Jobright export", () => {
  it("carries no named styles, so run size is the only structural signal", async () => {
    const parts = await readDocxParts(fixture("jobright-sample.docx"));
    expect(parts.styles).not.toBeNull();
    expect(parts.styles!).not.toContain("w:styleId");
  });

  it("finds every section header, each drawn with an image rule", async () => {
    const paras = await load("jobright-sample.docx");
    const headers = paras.filter((p) => p.size === 22);
    expect(headers.map((p) => p.text.trim())).toEqual([
      "Summary",
      "Career Highlights",
      "Professional Experience",
      "Core Competencies",
      "Education",
      "Certifications",
    ]);
    // Jobright draws its section rules as images rather than paragraph borders.
    expect(headers.every((p) => p.hasImage)).toBe(true);
  });

  it("separates entry lines from bullets by size and list membership", async () => {
    const paras = await load("jobright-sample.docx");
    expect(paras.filter((p) => p.size === 50)).toHaveLength(1); // the name
    expect(paras.filter((p) => p.size === 21 && !p.listId).length).toBeGreaterThan(0);
    expect(paras.filter((p) => p.listId).length).toBeGreaterThan(10);
  });
});

describe("template", () => {
  // Regression test. The first parser written against this file walked only the
  // body's direct children and reported Core Competencies as an empty section —
  // its content sits inside a <w:sdt> content control left behind by a Google
  // Docs export.
  it("reaches content nested inside a content control", async () => {
    const paras = await load("template-sample.docx");
    const nested = paras.filter((p) => p.inContentControl && p.text.trim());
    expect(nested.length).toBeGreaterThan(0);
  });

  it("reaches content nested inside a table", async () => {
    const paras = await load("template-sample.docx");
    expect(paras.filter((p) => p.inTable && p.text.trim()).length).toBeGreaterThan(0);
  });
});

describe("error handling", () => {
  it("rejects a file that is not a docx with a usable message", async () => {
    await expect(readDocxParts(Buffer.from("%PDF-1.7 not a docx"))).rejects.toBeInstanceOf(DocxReadError);
  });

  it("rejects a zip with no document part", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = await new JSZip().file("hello.txt", "hi").generateAsync({ type: "nodebuffer" });
    await expect(readDocxParts(zip)).rejects.toMatchObject({ code: "no_document_part" });
  });
});

describe("malicious input", () => {
  it("refuses an archive that inflates past the ceiling", async () => {
    const JSZip = (await import("jszip")).default;
    // A megabyte of one repeated byte compresses to almost nothing, which is
    // the shape of a decompression bomb. Checked against a lowered ceiling so
    // the test stays fast; production uses MAX_INFLATED_BYTES.
    const padding = new Uint8Array(1024 * 1024).fill(32);
    const bomb = await new JSZip()
      .file("word/document.xml", padding)
      .generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

    expect(bomb.length).toBeLessThan(64 * 1024);

    // Catch by hand rather than with .rejects: if this ever regresses, the
    // resolved value holds a megabyte-long string and vitest spends minutes
    // rendering it into the failure diff.
    const outcome = await readDocxParts(bomb, 64 * 1024).then(
      () => "resolved",
      (err: { code?: string }) => err.code
    );
    expect(outcome).toBe("inflated_too_large");
  }, 30000);

  /**
   * TEC-31. The size the guard summed was the one each entry *declares* — a
   * number in the file, free to understate. An archive that lies about it
   * passed, and was then inflated whole. The bytes are counted as they come out
   * of the decompressor now.
   */
  it("refuses a bomb that understates its own size", async () => {
    const JSZip = (await import("jszip")).default;
    const padding = new Uint8Array(1024 * 1024).fill(32);
    const bomb = await new JSZip()
      .file("word/document.xml", padding)
      .generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    // Rewrite the declared uncompressed size, in the local header and the
    // central directory, to 100 bytes.
    for (let i = 0; i + 4 <= bomb.length; i += 1) {
      const sig = bomb.readUInt32LE(i);
      if (sig === 0x04034b50) bomb.writeUInt32LE(100, i + 22);
      if (sig === 0x02014b50) bomb.writeUInt32LE(100, i + 24);
    }
    const declared = (await JSZip.loadAsync(bomb)).files["word/document.xml"] as unknown as {
      _data: { uncompressedSize: number };
    };
    expect(declared._data.uncompressedSize).toBe(100);

    const outcome = await readDocxParts(bomb, 64 * 1024).then(
      () => "resolved",
      (err: { code?: string }) => err.code
    );
    expect(outcome).toBe("inflated_too_large");
  }, 30000);

  /** TEC-31. The guard sat on the reader of the renderer's output; the upload
   *  itself is opened by the reskin engine's `loadDocx`, which had none. */
  it("refuses a bomb at the upload, before the renderer reads it", async () => {
    const JSZip = (await import("jszip")).default;
    const padding = new Uint8Array(1024 * 1024).fill(32);
    const bomb = await new JSZip()
      .file("word/document.xml", padding)
      .generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const outcome = await loadDocx(bomb, "the tailored resume", 64 * 1024).then(
      () => "resolved",
      (err: { code?: string }) => err.code
    );
    expect(outcome).toBe("inflated_too_large");
  }, 30000);

  it("reports the real fixtures as far below the production ceiling", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(fixture("jobright-sample.docx"));
    const size = await inflatedBytes(zip, MAX_INFLATED_BYTES);
    // Zero would mean the guard counted nothing, which is how it shipped the
    // first time: directory entries have no size and were poisoning the total.
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(MAX_INFLATED_BYTES / 10);
    await expect(readDocxParts(fixture("jobright-sample.docx"))).resolves.toBeTruthy();
  });
});
