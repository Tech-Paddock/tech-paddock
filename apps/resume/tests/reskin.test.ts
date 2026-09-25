import { readFileSync } from "node:fs";
import { join } from "node:path";
import { XMLValidator } from "fast-xml-parser";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { getBodyInner, loadDocx, withBodyInner } from "../lib/reskin/container";
import { joinBody, splitBody } from "../lib/reskin/blocks";
import { extractSourceContent } from "../lib/reskin/extract";
import { renderIntoTemplate } from "../lib/reskin/render";
import { reskin } from "../lib/reskin/generate";

const fixture = (n: string) => readFileSync(join(__dirname, "fixtures", n));
const TEMPLATE = () => fixture("template-sample.docx");
const SOURCE = () => fixture("jobright-sample.docx");

const bodyOf = async (bytes: Buffer) => getBodyInner((await loadDocx(bytes)).documentXml).bodyInner;

async function render() {
  const template = await loadDocx(TEMPLATE());
  const templateBody = getBodyInner(template.documentXml).bodyInner;
  const content = extractSourceContent(splitBody(await bodyOf(SOURCE())));
  const { blocks, changeLog } = renderIntoTemplate(splitBody(templateBody), content);
  return { templateBody, outBody: joinBody(blocks), changeLog, content, template };
}

const count = (xml: string, tag: string) => (xml.match(new RegExp(`<${tag}\\b`, "g")) ?? []).length;

describe("splitting and rejoining a document body", () => {
  it("reproduces the original body byte for byte", async () => {
    const body = await bodyOf(TEMPLATE());
    expect(joinBody(splitBody(body))).toBe(body);
  });

  it("does the same for the source document", async () => {
    const body = await bodyOf(SOURCE());
    expect(joinBody(splitBody(body))).toBe(body);
  });
});

// The point of the whole engine. Every one of these was measurably wrong in the
// renderer this replaced, and each is wrong again the moment anything starts
// rebuilding the document instead of editing the template's own bytes.
describe("what the template keeps", () => {
  it("keeps the page size — a US Letter template does not come out A4", async () => {
    const { docx } = await reskin(TEMPLATE(), SOURCE());
    const out = await JSZip.loadAsync(docx);
    const outXml = await out.file("word/document.xml")!.async("string");
    const templateXml = (await loadDocx(TEMPLATE())).documentXml;

    const pgSz = (s: string) => s.match(/<w:pgSz[^/]*\/>/)?.[0];
    expect(pgSz(outXml)).toBe(pgSz(templateXml));
    expect(pgSz(outXml)).toContain('w:w="12240"'); // 8.5in
  });

  it("leaves every part that defines the look byte-identical", async () => {
    const { docx } = await reskin(TEMPLATE(), SOURCE());
    const out = await JSZip.loadAsync(docx);
    const template = await JSZip.loadAsync(TEMPLATE());

    for (const part of ["word/styles.xml", "word/numbering.xml", "word/theme/theme1.xml", "word/fontTable.xml", "word/settings.xml"]) {
      const original = await template.file(part)?.async("string");
      expect(original, `${part} missing from the fixture`).toBeDefined();
      expect(await out.file(part)?.async("string"), part).toBe(original);
    }
  });

  it("keeps the body-level sectPr exactly", async () => {
    const { templateBody, outBody } = await render();
    const sectPr = (s: string) => s.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)?.[0] ?? "";
    expect(sectPr(outBody)).not.toBe("");
    expect(sectPr(outBody)).toBe(sectPr(templateBody));
  });

  it("keeps alignment, shading, borders and underline", async () => {
    const { templateBody, outBody } = await render();
    for (const tag of ["w:jc", "w:shd", "w:pBdr", "w:u"]) {
      expect(count(outBody, tag), tag).toBe(count(templateBody, tag));
    }
  });
});

describe("the XML it emits", () => {
  it("is well formed", async () => {
    const { template, outBody } = await render();
    expect(XMLValidator.validate(withBodyInner(template.documentXml, outBody))).toBe(true);
  });

  it("keeps open and close tags balanced", async () => {
    const { outBody } = await render();
    for (const tag of ["w:p", "w:tbl", "w:tr", "w:tc", "w:r"]) {
      const open = (outBody.match(new RegExp(`<${tag}[ >]`, "g")) ?? []).length;
      const close = (outBody.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
      expect(open, `${tag} open/close mismatch`).toBe(close);
    }
  });

  it("produces a real zip", async () => {
    const { docx } = await reskin(TEMPLATE(), SOURCE());
    expect(docx.subarray(0, 2).toString("hex")).toBe("504b"); // "PK"
  });

  it("is deterministic — the same inputs give the same document body twice", async () => {
    const a = await render();
    const b = await render();
    expect(a.outBody).toBe(b.outBody);
  });

  /**
   * TEC-31. The body was deterministic and the file was not: the rewritten
   * `word/document.xml` entry took the wall-clock time as its zip timestamp, so
   * two renders of the same inputs a few seconds apart hashed differently and
   * `content_hash` could not identify a render. The clock is set a day apart
   * here, rather than hoping two runs straddle a second, so this cannot pass by
   * luck and cannot fail under load.
   */
  it("is deterministic to the byte — the same inputs give the same file on different days", async () => {
    const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2031-01-01T00:00:00Z"));
      const first = await reskin(TEMPLATE(), SOURCE());
      vi.setSystemTime(new Date("2031-01-02T12:34:56Z"));
      const second = await reskin(TEMPLATE(), SOURCE());
      expect(sha(second.docx)).toBe(sha(first.docx));
    } finally {
      vi.useRealTimers();
    }
  });

  /** The same bug's other half: JSZip added a `word/` folder entry, stamped with
   *  the current time, to an archive that never had one. */
  it("writes back exactly the template's parts, adding none", async () => {
    const { docx } = await reskin(TEMPLATE(), SOURCE());
    const names = async (b: Buffer) => Object.keys((await JSZip.loadAsync(b)).files).sort();
    expect(await names(docx)).toEqual(await names(TEMPLATE()));
  });
});

describe("reading the source document", () => {
  it("pulls every job apart into company, title and date", async () => {
    const content = extractSourceContent(splitBody(await bodyOf(SOURCE())));
    expect(content.experience).toHaveLength(5);
    expect(content.experience[0]).toMatchObject({
      company: "Northwind Athletics",
      title: "Sr. Platform Administrator",
      date: "Jan 2026 - Present",
    });
    expect(content.experience[4].company).toBe("Trellis Construction Group");
  });

  it("does not leak the name and contact block into the summary", async () => {
    const content = extractSourceContent(splitBody(await bodyOf(SOURCE())));
    expect(content.summary).not.toContain("@");
    expect(content.summary).not.toContain("Jordan Rivers");
  });

  it("finds the competency rows", async () => {
    const content = extractSourceContent(splitBody(await bodyOf(SOURCE())));
    expect(content.competencies?.map((c) => c.label)).toEqual(["Platform", "Advisory", "Tooling"]);
  });

  // Not in the original, and its absence was silent: it read only a markdown
  // pipe table, and returning null means "keep the template's highlights", so a
  // source written this way left the old figures in place saying nothing.
  it("reads highlights written as one metric:description paragraph each", async () => {
    const content = extractSourceContent(splitBody(await bodyOf(SOURCE())));
    expect(content.careerHighlights).toHaveLength(4);
    expect(content.careerHighlights?.[0].stat).toBe("$250,000");
    expect(content.careerHighlights?.[3].stat).toBe("15% Under Budget");
  });
});

describe("what it does with each section", () => {
  it("leaves Career Highlights completely untouched when they already match", async () => {
    const { changeLog, templateBody, outBody } = await render();
    const ch = changeLog.filter((e) => e.section === "Career Highlights");
    expect(ch).toHaveLength(1);
    expect(ch[0].action).toBe("kept-unchanged");

    const table = (s: string) => s.match(/<w:tbl>[\s\S]*?<\/w:tbl>/)?.[0];
    expect(table(outBody)).toBe(table(templateBody));
  });

  it("copies Education straight from the template rather than the input", async () => {
    const { changeLog, outBody } = await render();
    expect(changeLog.some((e) => e.section === "Education" && e.action === "passthrough")).toBe(true);
    // The template's own wording survives; the source's mangled run-together
    // version of the same line never arrives.
    expect(outBody).toContain("Associate in Computer Science");
    expect(outBody).not.toContain("CollegeDec");
  });

  it("keeps a job entry on one page — keepLines on every paragraph, keepNext on all but the last", async () => {
    const { outBody, content } = await render();
    const entryParas = content.experience.reduce((sum, e) => sum + 1 + e.bullets.length, 0);
    expect((outBody.match(/<w:keepLines\/>/g) ?? []).length).toBe(entryParas);
    expect((outBody.match(/<w:keepNext\/>/g) ?? []).length).toBe(entryParas - content.experience.length);
  });

  it("rewrites competency lists to the template's own separator", async () => {
    const { outBody } = await render();
    expect(outBody).toContain("Alpha Platform · Beta Module");
    expect(outBody).not.toContain("Alpha Platform, Beta Module");
  });
});

describe("failing honestly", () => {
  it("rejects something that is not a zip", async () => {
    await expect(reskin(Buffer.from("not a docx"), SOURCE())).rejects.toThrow(/template/i);
  });

  it("rejects a zip with no document.xml", async () => {
    const notAWordFile = await new JSZip().file("hello.txt", "hi").generateAsync({ type: "nodebuffer" });
    await expect(reskin(TEMPLATE(), notAWordFile)).rejects.toThrow(/tailored resume/i);
  });
});
