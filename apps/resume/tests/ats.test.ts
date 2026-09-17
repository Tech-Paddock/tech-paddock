import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readDocxParts } from "../lib/docx/read";
import { extractParagraphs, type Para } from "../lib/docx/paragraphs";
import { auditAts } from "../lib/docx/ats";

async function audit(name: string) {
  const parts = await readDocxParts(readFileSync(join(__dirname, "fixtures", name)));
  return auditAts(parts, extractParagraphs(parts.document));
}
const codes = (f: Awaited<ReturnType<typeof audit>>) => f.map((x) => x.code).sort();

describe("ATS lint", () => {
  // A lint that finds nothing proves nothing. Both fixtures have known defects,
  // so these assert it actually catches them.
  it("flags the image-drawn section rules in the Jobright export", async () => {
    expect(codes(await audit("jobright-sample.docx"))).toContain("images");
  });

  it("flags the content control and the extra table in the template", async () => {
    const found = codes(await audit("template-sample.docx"));
    expect(found).toContain("content_control");
    expect(found).toContain("too_many_tables");
  });

  it("reports blocking findings distinctly from warnings", async () => {
    const findings = await audit("template-sample.docx");
    expect(findings.some((f) => f.severity === "blocking")).toBe(true);
    expect(findings.every((f) => f.message.length > 20)).toBe(true);
  });

  // A lint that finds nothing proves nothing — and one that finds the wrong
  // thing five times over is worse, because you stop reading it.
  it("finds nothing in the current template's structure", async () => {
    expect(await audit("template-flat-sample.docx")).toEqual([]);
  });
});

/**
 * Section headings and employment entry lines are set at the **same point size**
 * in Joel's template, so ranking by size alone reported all five of his jobs as
 * unrecognised headings. Five false findings in one document, on a warning whose
 * only job is to be believed.
 *
 * Both halves matter and they pull against each other, which is why they are one
 * test: loosening the rule until the entry lines stop being reported also stops
 * it reporting the creative heading it exists for.
 */
describe("telling a section heading from a job", () => {
  const para = (over: Partial<Para>): Para => ({
    index: 0, text: "", size: 22, bold: false, italic: false, listId: null, styleId: null,
    hasImage: false, inTable: false, inContentControl: false, cell: null, runs: [], ...over,
  });

  const paras: Para[] = [
    para({ text: "Jordan Avery", size: 40 }),
    para({ text: "Professional Experience" }),
    para({ text: "Lakeside Systems   Senior Administrator\tJan 2026 - Present" }),
    para({ text: "Harbor Point Group   Consultant\tOct 2024 - Jan 2026" }),
    para({ text: "Where I Have Made An Impact" }),
    para({ text: "Education" }),
  ];

  const unknownIn = async (ps: Para[]) => {
    // Real parts so the XML-level checks have something to read; the paragraphs
    // are the variable under test.
    const parts = await readDocxParts(readFileSync(join(__dirname, "fixtures", "template-flat-sample.docx")));
    return auditAts(parts, ps).find((f) => f.code === "unknown_heading")?.message ?? "";
  };

  it("does not report an entry line as an unrecognised heading", async () => {
    const message = await unknownIn(paras);
    expect(message).not.toContain("Lakeside Systems");
    expect(message).not.toContain("Harbor Point Group");
  });

  it("still reports a genuinely creative heading", async () => {
    expect(await unknownIn(paras)).toContain("Where I Have Made An Impact");
  });

  // A name appears once; headings repeat. That is the only thing separating them
  // when the name is in the body, which is where the ATS fix puts it.
  it("ranks the headings below a name set larger than them", async () => {
    const message = await unknownIn(paras);
    expect(message).not.toContain("Jordan Avery");
  });
});
