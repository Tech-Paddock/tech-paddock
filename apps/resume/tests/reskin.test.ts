import { readFileSync } from "node:fs";
import { join } from "node:path";
import { XMLValidator } from "fast-xml-parser";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { getBodyInner, loadDocx, withBodyInner } from "../lib/reskin/container";
import { extractText, joinBody, splitBody } from "../lib/reskin/blocks";
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

/**
 * TEC-31. Experience regroups its paragraphs into entries and emitted nothing
 * else, so a `<w:sdt>` opened in Experience and closed in the next section left
 * a dangling closer — malformed XML, a document Word refuses — and a table or a
 * bookmark there vanished with nothing said.
 */
describe("what Experience does with blocks that are not paragraphs", () => {
  const p = (text: string, pPr = "") => `<w:p>${pPr}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const BULLET = '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>';
  const SDT_OPEN = '<w:sdt><w:sdtPr><w:id w:val="1"/></w:sdtPr><w:sdtContent>';
  const SDT_CLOSE = "</w:sdtContent></w:sdt>";
  const BOOKMARK = '<w:bookmarkStart w:id="0" w:name="jobs"/>';
  const TABLE = `<w:tbl><w:tr><w:tc>${p("A template table cell")}</w:tc></w:tr></w:tbl>`;
  const templateBody = [
    p("Professional Experience"),
    SDT_OPEN,
    BOOKMARK,
    p("Template Co   Template Title"),
    p("Template bullet one.", BULLET),
    TABLE,
    p("Core Competencies"),
    SDT_CLOSE,
    p("Systems: Alpha"),
  ].join("");
  const content = {
    summary: null,
    careerHighlights: null,
    competencies: null,
    experience: [{ company: "Acme Corp", title: "Analyst", date: "Jan 2020 - Present", bullets: ["Did a thing."] }],
  };

  it("keeps a content control opened there well formed", () => {
    const { blocks } = renderIntoTemplate(splitBody(templateBody), content);
    const out = joinBody(blocks);
    expect(XMLValidator.validate(`<w:body>${out}</w:body>`)).toBe(true);
    expect(out.indexOf("<w:sdt>")).toBeLessThan(out.indexOf("Acme Corp"));
    expect(out).toContain(SDT_CLOSE);
  });

  it("keeps a bookmark and a table, and says so about the table", () => {
    const { blocks, changeLog } = renderIntoTemplate(splitBody(templateBody), content);
    const out = joinBody(blocks);
    expect(out).toContain(BOOKMARK);
    expect(out).toContain("A template table cell");
    expect(changeLog).toContainEqual(
      expect.objectContaining({ section: "Professional Experience", action: "kept-unchanged", detail: expect.stringMatching(/table/) })
    );
  });
});

describe("reading the source document", () => {
  const para = (runs: string, pPr = "") => `<w:p>${pPr}${runs}</w:p>`;
  const run = (text: string, rPr = "") => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`;
  const TAB = "<w:r><w:tab/></w:r>";
  const BULLET = '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>';
  const TAB_STOP = '<w:pPr><w:tabs><w:tab w:val="right" w:pos="10800"/></w:tabs></w:pPr>';

  /**
   * TEC-31. A run-level `<w:tab/>` was dropped on the way out of the source, so a
   * positioned line's fields ran together — company "Acme CorpJan", date
   * "2020 - Present" — and the content check still read 100%, because the glued
   * text did arrive.
   */
  it("reads a tab between company and date as a field boundary", () => {
    const body = [
      para(run("Professional Experience")),
      para(run("Acme Corp", "<w:b/>") + TAB + run("Jan 2020 - Present", "<w:b/>"), TAB_STOP),
      para(run("Operations Analyst", "<w:i/>")),
      para(run("Did a representative thing."), BULLET),
    ].join("");
    const [entry] = extractSourceContent(splitBody(body)).experience;
    expect(entry).toEqual({
      company: "Acme Corp",
      title: "Operations Analyst",
      date: "Jan 2020 - Present",
      bullets: ["Did a representative thing."],
    });
  });

  it("splits company, title and date that share one tabbed line", () => {
    const body = [
      para(run("Experience")),
      para(run("Acme Corp", "<w:b/>") + TAB + run("Analyst", "<w:b/>") + TAB + run("Mar 2019 - 2021", "<w:b/>")),
      para(run("Did a representative thing."), BULLET),
    ].join("");
    const [entry] = extractSourceContent(splitBody(body)).experience;
    expect(entry).toMatchObject({ company: "Acme Corp", title: "Analyst", date: "Mar 2019 - 2021" });
  });

  /**
   * TEC-31. A heading the renderer had no section for did not end the section
   * before it, so a Projects section after Experience was read as more jobs —
   * and shipped in the output as a sixth employer.
   */
  describe("a source section the template has no place for", () => {
    const H = '<w:b/><w:sz w:val="22"/>';
    const body = (projectsHeading: string) =>
      [
        para(run("Professional Experience", H)),
        para(run("Acme Corp", '<w:b/><w:sz w:val="21"/>') + TAB + run("Jan 2020 - Present", '<w:sz w:val="21"/>')),
        para(run("Operations Analyst", '<w:i/><w:sz w:val="21"/>')),
        para(run("Did a representative thing."), BULLET),
        para(run(projectsHeading, H)),
        para(run("Sample Project", '<w:b/><w:sz w:val="21"/>')),
        para(run("Built a representative prototype."), BULLET),
        para(run("Core Competencies", H)),
        para(run("Systems: Alpha, Beta")),
      ].join("");

    it.each([
      ["a heading the vocabulary knows but the template has no section for", "Projects"],
      ["a heading the vocabulary does not know, found by its size", "Side Ventures"],
    ])("stops at %s, and reports it", (_what, heading) => {
      const content = extractSourceContent(splitBody(body(heading)));
      expect(content.experience.map((e) => e.company)).toEqual(["Acme Corp"]);
      expect(content.competencies).toEqual([{ label: "Systems", items: "Alpha, Beta" }]);
      expect(content.unplacedSections).toEqual([{ heading, lines: 2 }]);
    });

    it("logs it as input with nowhere to go, which the verdict fails on", async () => {
      const template = await loadDocx(fixture("template-flat-sample.docx"));
      const { changeLog } = renderIntoTemplate(
        splitBody(getBodyInner(template.documentXml).bodyInner),
        extractSourceContent(splitBody(body("Projects")))
      );
      expect(changeLog).toContainEqual(expect.objectContaining({ section: "Projects", action: "input-dropped" }));
    });

    it("reports nothing on the repo's own source, which has no such section", async () => {
      expect(extractSourceContent(splitBody(await bodyOf(SOURCE()))).unplacedSections).toBeUndefined();
    });
  });

  /** The other half of the `<w:tab>` trap: a tab *stop* is not text. */
  it("does not invent a tab from a paragraph's tab stops", () => {
    expect(extractText(para(run("Acme Corp"), TAB_STOP))).toBe("Acme Corp");
    expect(extractText(para(TAB + run("Acme Corp"), TAB_STOP))).toBe("\tAcme Corp");
  });

  it("pulls every job apart into company, title and date", async () => {
    const content = extractSourceContent(splitBody(await bodyOf(SOURCE())));
    expect(content.experience).toHaveLength(5);
    expect(content.experience[0]).toMatchObject({
      company: "Northwind Athletics",
      title: "Sr. Platform Administrator",
      date: "Nov 2022 - Present",
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
