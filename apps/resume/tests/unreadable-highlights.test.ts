import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verdictFor } from "@/lib/verdict";
import { readDocxParts } from "@/lib/docx/read";
import { extractParagraphs } from "@/lib/docx/paragraphs";
import { auditAts } from "@/lib/docx/ats";
import { compareLines } from "@/lib/docx/compare";
import { linesTaken, reskin } from "@/lib/reskin/generate";
import { makeDocx, para, table } from "./helpers/docx";

/**
 * TEC-79. A Career Highlights pipe table whose rows do not pair up is refused
 * rather than guessed at — and that refusal used to read as "the input had no
 * highlights": `kept-unchanged`, nothing counted as missing, verdict PASS, while
 * the source's highlight text reached the document nowhere. The charter's rule
 * is that coverage must not be able to lie; this is the case where it did.
 */

const template = () => readFileSync(join(__dirname, "fixtures", "template-flat-sample.docx"));

/** Career Highlights given as raw blocks — paragraphs, a table, or both. */
const source = (blocks: string[]) =>
  makeDocx({
    body: [
      para("Alex Placeholder", 50),
      para("alex@example.invalid | 555-0100", 18),
      ...(blocks.length > 0 ? [para("Career Highlights", 22), ...blocks] : []),
      para("Professional Experience", 22),
      para("Example Corp Jan 2024 - Present", 21),
      para("Analyst", 21),
      para("Did a measurable thing.", 20, { list: true }),
    ].join(""),
  });

/** The verdict exactly as the reformat route and the Reformat tab compute it. */
async function run(blocks: string[]) {
  const { docx, changeLog, content } = await reskin(template(), await source(blocks));
  const rendered = await readDocxParts(docx);
  const paras = extractParagraphs(rendered.document);
  const coverage = compareLines(linesTaken(content), paras);
  const verdict = verdictFor({ coverage, findings: auditAts(rendered, paras), changeLog });
  const highlightLog = changeLog.filter((c) => c.section === "Career Highlights");
  return { content, coverage, verdict, highlightLog };
}

const lines = (ls: string[]) => ls.map((l) => para(l, 20));

const MISALIGNED = lines([
  "| Zorblatt 250 | Quintessa 30 | Vexmoor 230 |",
  "| :--- | :--- | :--- |",
  "| Frobnicated the widget pipeline |",
]);

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
    const { content, verdict } = await run(lines(["Frobnicated the widget pipeline across the whole estate"]));
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
    const { content, highlightLog } = await run(
      lines([
        "| Zorblatt 250 | Quintessa 30 |",
        "| :--- | :--- |",
        "| Frobnicated the widget pipeline | Reticulated the splines |",
      ])
    );
    expect(content.unreadableHighlights).toBeUndefined();
    expect(content.careerHighlights).toHaveLength(2);
    expect(highlightLog.some((c) => c.action === "input-dropped" && /could not be read/.test(c.detail))).toBe(false);
  });
});

/**
 * TEC-87. The same failure through a Word table: the reader kept cells of two
 * paragraphs or more and skipped the rest, so a one-line cell or a third
 * paragraph vanished, and a table of nothing but one-line cells read as "no
 * highlights" and passed.
 */
describe("Career Highlights given as a Word table", () => {
  const cell = (...ps: string[]) => ps.map((p) => para(p, 20));

  it("reads a table whose every cell is one metric and one description", async () => {
    const { content, highlightLog } = await run([
      table([cell("Zorblatt 250", "Frobnicated the widget pipeline"), cell("Quintessa 30", "Reticulated the splines")]),
    ]);
    expect(content.careerHighlights).toEqual([
      { stat: "Zorblatt 250", desc: "Frobnicated the widget pipeline" },
      { stat: "Quintessa 30", desc: "Reticulated the splines" },
    ]);
    expect(content.unreadableHighlights).toBeUndefined();
    // The template has four cells and this fills two, so two are not-found-in-input;
    // what matters here is that nothing of the source was dropped.
    expect(highlightLog.map((c) => c.action)).not.toContain("input-dropped");
  });

  it("ignores blank paragraphs in a cell rather than reading one as the metric", async () => {
    const { content } = await run([table([cell("", "Zorblatt 250", "Frobnicated the widget pipeline", "")])]);
    expect(content.careerHighlights).toEqual([{ stat: "Zorblatt 250", desc: "Frobnicated the widget pipeline" }]);
  });

  it("refuses the whole table when one cell is a single line, and fails the verdict", async () => {
    const { content, coverage, verdict, highlightLog } = await run([
      table([cell("Zorblatt 250", "Frobnicated the widget pipeline"), cell("Quintessa 30 lone figure")]),
    ]);
    expect(content.careerHighlights).toBeNull();
    expect(content.unreadableHighlights).toEqual(["Zorblatt 250", "Frobnicated the widget pipeline", "Quintessa 30 lone figure"]);
    expect(highlightLog.map((c) => c.action)).toEqual(["input-dropped"]);
    expect(coverage.missing).toContain("Quintessa 30 lone figure");
    expect(verdict.pass).toBe(false);
  });

  it("refuses a cell with a third paragraph rather than dropping it", async () => {
    const { content, verdict } = await run([
      table([cell("Zorblatt 250", "Frobnicated the widget pipeline", "Across the whole estate")]),
    ]);
    expect(content.unreadableHighlights).toContain("Across the whole estate");
    expect(verdict.pass).toBe(false);
  });

  it("no longer reads a table of one-line cells as an input with no highlights", async () => {
    const { content, highlightLog, verdict } = await run([table([cell("Zorblatt 250"), cell("Quintessa 30")])]);
    expect(content.unreadableHighlights).toEqual(["Zorblatt 250", "Quintessa 30"]);
    expect(highlightLog.map((c) => c.action)).not.toContain("kept-unchanged");
    expect(verdict.pass).toBe(false);
  });

  it("keeps every table's cells when the section has two, rather than only the last", async () => {
    const { content } = await run([
      table([cell("Zorblatt 250", "Frobnicated the widget pipeline")]),
      table([cell("Quintessa 30", "Reticulated the splines")]),
    ]);
    expect(content.careerHighlights?.map((h) => h.stat)).toEqual(["Zorblatt 250", "Quintessa 30"]);
  });

  it("refuses a table beside paragraphs of text rather than reading one and losing the other", async () => {
    const { content, verdict } = await run([
      table([cell("Zorblatt 250", "Frobnicated the widget pipeline")]),
      para("Quintessa 30: Reticulated the splines", 20),
    ]);
    expect(content.careerHighlights).toBeNull();
    expect(content.unreadableHighlights).toEqual([
      "Zorblatt 250",
      "Frobnicated the widget pipeline",
      "Quintessa 30: Reticulated the splines",
    ]);
    expect(verdict.pass).toBe(false);
  });

  it("reads the template itself as a source with every highlight and nothing unreadable", async () => {
    const { content } = await reskin(template(), template());
    expect(content.careerHighlights?.length).toBeGreaterThan(0);
    expect(content.unreadableHighlights).toBeUndefined();
  });
});
