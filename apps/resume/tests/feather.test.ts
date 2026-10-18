import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { XMLValidator } from "fast-xml-parser";
import { makeDocx } from "./helpers/docx";
import { extractText, hasNumPr, splitBody } from "../lib/reskin/blocks";
import { getBodyInner, loadDocx } from "../lib/reskin/container";
import { extractSourceContent } from "../lib/reskin/extract";
import { renderIntoTemplate } from "../lib/reskin/render";
import { checkContent, reskin } from "../lib/reskin/generate";
import { readDocxParts } from "../lib/docx/read";
import { extractParagraphs } from "../lib/docx/paragraphs";
import { auditAts } from "../lib/docx/ats";
import { verdictFor } from "../lib/verdict";

/**
 * TEC-107 and TEC-105, Joel 2026-10-14: an input line with no slot in
 * **Professional Experience** is feathered in where the input has it; a line
 * with no slot in **any other content section** stays missing and fails.
 *
 * Every document here is written in this file, with invented names only, so no
 * part of any archive can carry a real one.
 */

const fixture = (n: string) => readFileSync(join(__dirname, "fixtures", n));

const H = '<w:b/><w:sz w:val="22"/>';
const BULLET = '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>';
const run = (text: string, rPr = "") =>
  `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const TAB = "<w:r><w:tab/></w:r>";
const para = (runs: string, pPr = "") => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${runs}</w:p>`;

const ROLE_LINE = "Led a representative regional programme across four invented sites.";

/** A source whose first job has a one-line role description between its title
 *  and its bullets — a line no field of the template's entry is for. */
const sourceWithRoleLine = () =>
  makeDocx({
    body: [
      para(run("Avery Example", '<w:sz w:val="40"/>')),
      para(run("Summary", H)),
      para(run("Operations lead with a representative record of invented outcomes across several sample teams.")),
      para(run("Professional Experience", H)),
      para(run("Fabrikam Logistics", "<w:b/>") + TAB + run("Jan 2021 - Present", "<w:b/>")),
      para(run("Operations Manager", "<w:i/>")),
      para(run(ROLE_LINE)),
      para(run("Cut a representative cycle time by an invented margin."), BULLET),
      para(run("Ran a sample vendor review end to end."), BULLET),
      para(run("Contoso Freight", "<w:b/>") + TAB + run("Mar 2017 - Dec 2020", "<w:b/>")),
      para(run("Operations Analyst", "<w:i/>")),
      para(run("Built a representative weekly report."), BULLET),
      para(run("Core Competencies", H)),
      para(run("Systems: Alpha, Beta, Gamma")),
    ].join(""),
  });

async function renderFlat(source: Buffer) {
  const template = fixture("template-flat-sample.docx");
  const { docx, changeLog, content } = await reskin(template, source);
  const parts = await readDocxParts(docx);
  const paras = extractParagraphs(parts.document);
  const coverage = checkContent(content, paras, changeLog);
  const findings = auditAts(parts, paras);
  return { template, docx, changeLog, content, parts, paras, coverage, findings };
}

describe("feathering a Professional Experience line the template has no slot for", () => {
  it("puts it in the output after the line that precedes it in the input, and logs it", async () => {
    const { paras, changeLog } = await renderFlat(await sourceWithRoleLine());
    const texts = paras.map((p) => p.text.trim());

    const at = texts.indexOf(ROLE_LINE);
    expect(at, "the role line reached the document").toBeGreaterThan(-1);
    // The input has it after the title, which shares the template's one header
    // line with the company and dates — so it lands straight after that line,
    // and straight before the job's first bullet.
    expect(texts[at - 1]).toMatch(/^Fabrikam Logistics\s+Operations Manager\tJan 2021 - Present$/);
    expect(texts[at + 1]).toBe("Cut a representative cycle time by an invented margin.");
    // Once, not twice.
    expect(texts.filter((t) => t === ROLE_LINE)).toHaveLength(1);

    const feathered = changeLog.filter((c) => c.action === "feathered");
    expect(feathered).toHaveLength(1);
    expect(feathered[0]).toMatchObject({ section: "Professional Experience", lines: [ROLE_LINE] });
    expect(feathered[0].detail).toContain('after "Operations Manager"');
    expect(feathered[0].detail).toContain("formatted like the template's bullet");
  });

  /**
   * Joel, 2026-10-18 (TEC-107): a feathered line that is not a bullet looks
   * "Like a bullet line" — body size, not bold. It used to copy the job's header
   * line, which in the real template is bold at heading size, so a role
   * description read as a second job and the lint called it an unrecognised
   * section heading. It is now a copy of the nearest template bullet paragraph,
   * glyph included.
   */
  it("takes the template's bullet paragraph, glyph and all, never the bold header line", async () => {
    const { parts, paras, findings } = await renderFlat(await sourceWithRoleLine());
    const template = await loadDocx(fixture("template-flat-sample.docx"));
    const tplBlocks = splitBody(getBodyInner(template.documentXml).bodyInner);
    const headerLine = tplBlocks.find((b) => extractText(b.raw).startsWith("Lakeside Systems"))!;
    // The nearest bullet of the first entry, which is the one the line is in.
    const headerAt = tplBlocks.indexOf(headerLine);
    const bullet = tplBlocks.slice(headerAt + 1).find((b) => hasNumPr(b.raw))!;
    const outLine = parts.document.match(new RegExp(`<w:p\\b(?:(?!<w:p\\b)[\\s\\S])*?${ROLE_LINE}[\\s\\S]*?</w:p>`))![0];

    const runProps = (raw: string) => raw.match(/<w:r(?:\s[^>]*)?>\s*<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? "";
    const numPr = (raw: string) => raw.match(/<w:numPr>[\s\S]*?<\/w:numPr>/)?.[0];
    // The bullet's own run properties and list membership — not the header's.
    expect(runProps(outLine)).toBe(runProps(bullet.raw));
    expect(runProps(outLine)).not.toBe(runProps(headerLine.raw));
    expect(numPr(outLine)).toBe(numPr(bullet.raw));
    const outPara = paras.find((p) => p.text.trim() === ROLE_LINE)!;
    const bulletPara = paras.find((p) => p.text.trim() === "Cut a representative cycle time by an invented margin.")!;
    expect(outPara.listId).not.toBeNull();
    expect(outPara.listId).toBe(bulletPara.listId);

    // So the lint does not take it for a section heading.
    expect(findings.filter((f) => f.message.includes(ROLE_LINE))).toEqual([]);
    expect(findings.some((f) => f.code === "unknown_heading")).toBe(false);
  });

  it("counts it in coverage, passes, and keeps styles, numbering and theme byte-identical", async () => {
    const { template, docx, coverage, findings, changeLog, parts } = await renderFlat(await sourceWithRoleLine());
    expect(coverage.missing).toEqual([]);
    expect(coverage.percent).toBe(100);

    const v = verdictFor({ coverage, findings, changeLog });
    expect(v.pass).toBe(true);
    expect(v.notes.some((n) => /feathered in where the input has it/.test(n))).toBe(true);

    expect(XMLValidator.validate(parts.document)).toBe(true);
    const out = await JSZip.loadAsync(docx);
    const tpl = await JSZip.loadAsync(template);
    for (const part of ["word/styles.xml", "word/numbering.xml", "word/theme/theme1.xml"]) {
      expect(await out.file(part)?.async("string"), part).toBe(await tpl.file(part)?.async("string"));
    }
  });

  it("checks every Experience line in coverage, not only the fields read out of it", async () => {
    const content = extractSourceContent(splitBody(getBodyInner((await loadDocx(await sourceWithRoleLine())).documentXml).bodyInner));
    // The role line is in no field…
    const first = content.experience[0];
    expect([first.company, first.title, first.date, ...first.bullets]).not.toContain(ROLE_LINE);
    // …and coverage looks for it anyway: against a document without it, it is missing.
    const without = checkContent(content, [{ text: "Fabrikam Logistics Operations Manager Jan 2021 - Present" } as never]);
    expect(without.missing).toContain(ROLE_LINE);
  });

  it("feathers a bullet whose template entry has no bullet, formatted like the nearest bullet", async () => {
    // The template's second entry is a header line with no bullet under it.
    const tplBlocks = splitBody(
      [
        para(run("Professional Experience", H)),
        para(run("Template Employer One", "<w:b/>") + TAB + run("2020 - 2021")),
        para(run("Template bullet one.", '<w:color w:val="333333"/>'), BULLET),
        para(run("Template Employer Two", "<w:b/>") + TAB + run("2018 - 2020")),
      ].join("")
    );
    const { blocks, changeLog } = renderIntoTemplate(tplBlocks, {
      summary: null,
      careerHighlights: null,
      competencies: null,
      experience: [
        { company: "Northgate Sample Co", title: "Coordinator", date: "Jan 2020 - Dec 2021", bullets: ["Ran a sample rollout."] },
        {
          company: "Southgate Sample Co",
          title: "Assistant",
          date: "Jan 2018 - Dec 2019",
          bullets: ["Assisted a representative invented team."],
        },
      ],
    });
    const texts = blocks.map((b) => extractText(b.raw).trim());
    const at = texts.indexOf("Assisted a representative invented team.");
    expect(at).toBe(texts.findIndex((t) => t.startsWith("Southgate Sample Co")) + 1);
    expect(hasNumPr(blocks[at].raw)).toBe(true);
    expect(blocks[at].raw).toContain('<w:color w:val="333333"/>');
    // It used to be `input-dropped`, and the line reached the document nowhere.
    expect(changeLog.some((c) => c.action === "input-dropped")).toBe(false);
    expect(changeLog.filter((c) => c.action === "feathered").map((c) => c.lines)).toEqual([
      ["Assisted a representative invented team."],
    ]);
  });
});

describe("a line with no slot outside Professional Experience", () => {
  /** A template with a Summary heading and nothing under it: the summary has no slot. */
  const templateWithoutSummarySlot = () =>
    makeDocx({
      body: [
        para(run("Morgan Template", '<w:sz w:val="40"/>')),
        para(run("Summary", H)),
        para(run("Professional Experience", H)),
        para(run("Template Employer", "<w:b/>") + TAB + run("2019 - 2022")),
        para(run("Template bullet.", ""), BULLET),
        para(run("Core Competencies", H)),
        para(run("Systems: Template, Items")),
      ].join(""),
    });

  it("is not feathered, stays missing, fails the verdict, and coverage names the line, section and reason", async () => {
    const template = await templateWithoutSummarySlot();
    const source = await sourceWithRoleLine();
    const { docx, changeLog, content } = await reskin(template, source);
    const parts = await readDocxParts(docx);
    const paras = extractParagraphs(parts.document);
    const coverage = checkContent(content, paras, changeLog);

    const summary = content.summary!;
    expect(parts.document).not.toContain("Operations lead with a representative record");
    expect(coverage.missing).toEqual([summary]);
    expect(changeLog.some((c) => c.action === "feathered" && c.section !== "Professional Experience")).toBe(false);

    expect(coverage.missingDetail).toEqual([
      {
        line: summary,
        section: "Summary",
        reason: expect.stringMatching(/no summary paragraph/),
      },
    ]);

    const v = verdictFor({ coverage, findings: auditAts(parts, paras), changeLog });
    expect(v.pass).toBe(false);
    expect(v.reasons[0]).toMatch(/1 line of the source reached no part of the document/);
  });

  it("fails on a Career Highlight with no cell, naming both of its lines", async () => {
    const template = await loadDocx(fixture("template-flat-sample.docx"));
    const tplBlocks = splitBody(getBodyInner(template.documentXml).bodyInner);
    const many = Array.from({ length: 12 }, (_, i) => ({ stat: `${i + 1}1%`, desc: `Invented outcome number ${i + 1}.` }));
    const { changeLog } = renderIntoTemplate(tplBlocks, {
      summary: null,
      careerHighlights: many,
      competencies: null,
      experience: [],
    });
    const dropped = changeLog.filter((c) => c.action === "input-dropped" && c.section === "Career Highlights");
    expect(dropped.length).toBeGreaterThan(0);
    const last = many[many.length - 1];
    expect(dropped[dropped.length - 1].lines).toEqual([last.stat, last.desc]);
    expect(changeLog.some((c) => c.action === "feathered")).toBe(false);
  });
});
