import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verdictFor } from "@/lib/verdict";
import { readDocxParts } from "@/lib/docx/read";
import { extractParagraphs } from "@/lib/docx/paragraphs";
import { auditAts } from "@/lib/docx/ats";
import { compareLines } from "@/lib/docx/compare";
import { linesTaken, reskin } from "@/lib/reskin/generate";
import { makeDocx, para } from "./helpers/docx";

/**
 * TEC-79. A Career Highlights pipe table whose rows do not pair up is refused
 * rather than guessed at — and that refusal used to read as "the input had no
 * highlights": `kept-unchanged`, nothing counted as missing, verdict PASS, while
 * the source's highlight text reached the document nowhere. The charter's rule
 * is that coverage must not be able to lie; this is the case where it did.
 */

const template = () => readFileSync(join(__dirname, "fixtures", "template-flat-sample.docx"));

const source = (highlights: string[]) =>
  makeDocx({
    body: [
      para("Alex Placeholder", 50),
      para("alex@example.invalid | 555-0100", 18),
      ...(highlights.length > 0 ? [para("Career Highlights", 22), ...highlights.map((h) => para(h, 20))] : []),
      para("Professional Experience", 22),
      para("Example Corp Jan 2024 - Present", 21),
      para("Analyst", 21),
      para("Did a measurable thing.", 20, { list: true }),
    ].join(""),
  });

/** The verdict exactly as the reformat route and the Reformat tab compute it. */
async function run(highlights: string[]) {
  const { docx, changeLog, content } = await reskin(template(), await source(highlights));
  const rendered = await readDocxParts(docx);
  const paras = extractParagraphs(rendered.document);
  const coverage = compareLines(linesTaken(content), paras);
  const verdict = verdictFor({ coverage, findings: auditAts(rendered, paras), changeLog });
  const highlightLog = changeLog.filter((c) => c.section === "Career Highlights");
  return { content, coverage, verdict, highlightLog };
}

const MISALIGNED = [
  "| Zorblatt 250 | Quintessa 30 | Vexmoor 230 |",
  "| :--- | :--- | :--- |",
  "| Frobnicated the widget pipeline |",
];

describe("Career Highlights the source has but cannot be read", () => {
  it("keeps their text, cell by cell, rather than reading them as absent", async () => {
    const { content } = await run(MISALIGNED);
    expect(content.careerHighlights).toBeNull();
    expect(content.unreadableHighlights).toEqual([
      "Zorblatt 250",
      "Quintessa 30",
      "Vexmoor 230",
      "Frobnicated the widget pipeline",
    ]);
  });

  it("logs them as input-dropped, never as kept-unchanged", async () => {
    const { highlightLog } = await run(MISALIGNED);
    expect(highlightLog.map((c) => c.action)).toEqual(["input-dropped"]);
    expect(highlightLog[0].detail).toMatch(/could not be read/);
  });

  it("names every lost cell in coverage", async () => {
    const { coverage } = await run(MISALIGNED);
    expect(coverage.missing).toEqual(expect.arrayContaining(["Zorblatt 250", "Frobnicated the widget pipeline"]));
  });

  it("fails the verdict, saying which section", async () => {
    const { verdict } = await run(MISALIGNED);
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons.join(" ")).toMatch(/dropped — Career Highlights/);
  });

  it("does the same for plain lines that are neither a table nor metric: description", async () => {
    const { content, verdict } = await run(["Frobnicated the widget pipeline across the whole estate"]);
    expect(content.unreadableHighlights).toEqual(["Frobnicated the widget pipeline across the whole estate"]);
    expect(verdict.pass).toBe(false);
  });
});

describe("the cases either side, which must not change", () => {
  it("a source with no Career Highlights still keeps the template's, as kept-unchanged", async () => {
    const { content, highlightLog } = await run([]);
    expect(content.unreadableHighlights).toBeUndefined();
    expect(highlightLog.map((c) => c.action)).toEqual(["kept-unchanged"]);
  });

  it("a table that lines up is read, and reports nothing unreadable", async () => {
    const { content, highlightLog } = await run([
      "| Zorblatt 250 | Quintessa 30 |",
      "| :--- | :--- |",
      "| Frobnicated the widget pipeline | Reticulated the splines |",
    ]);
    expect(content.unreadableHighlights).toBeUndefined();
    expect(content.careerHighlights).toHaveLength(2);
    expect(highlightLog.some((c) => c.action === "input-dropped" && /could not be read/.test(c.detail))).toBe(false);
  });
});
