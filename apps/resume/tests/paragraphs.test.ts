import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readDocxParts, DocxReadError } from "../lib/docx/read";
import { extractParagraphs } from "../lib/docx/paragraphs";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name));
const load = async (name: string) => extractParagraphs((await readDocxParts(fixture(name))).document);

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
