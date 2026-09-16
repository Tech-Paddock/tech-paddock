import { describe, expect, it } from "vitest";
import { readDocxParts } from "../lib/docx/read";
import { extractParagraphs } from "../lib/docx/paragraphs";
import { labelParagraphs } from "../lib/docx/label";
import { DEFAULT_SPEC, extractSpec, firstTableLayout } from "../lib/docx/spec";
import { auditAts, headerFooterText } from "../lib/docx/ats";
import { buildResumeDocx } from "../lib/docx/build";
import { makeDocx, para, table } from "./helpers/docx";
import JSZip from "jszip";

/**
 * Jobright renders Career Highlights as a markdown table and pastes it in as
 * three ordinary paragraphs. Verbatim from a real export, with the numbers and
 * wording replaced.
 */
const MARKDOWN_HIGHLIGHTS = [
  para("| $250,000 | 30% | 230 | 15% Under Budget |", 20),
  para("| :--- | :--- | :--- | :--- |", 20),
  para(
    "| Annual savings through automation | Lift in revenue capture | Defects resolved in testing | Engagement delivered on schedule |",
    20
  ),
];

const jobrightish = (highlights: string[]) =>
  makeDocx({
    body: [
      para("Alex Placeholder", 50),
      para("alex@example.invalid | 555-0100", 18),
      para("Career Highlights", 22),
      ...highlights,
      para("Professional Experience", 22),
      para("Example Corp Jan 2024 - Present", 21),
      para("Analyst", 21),
      para("Did a measurable thing.", 20, { list: true }),
    ].join(""),
  });

async function label(buffer: Buffer) {
  const parts = await readDocxParts(buffer);
  return labelParagraphs(extractParagraphs(parts.document));
}

describe("Career Highlights arriving as a markdown table", () => {
  it("transposes the pipe rows into metric and description pairs", async () => {
    const { content } = await label(await jobrightish(MARKDOWN_HIGHLIGHTS));
    const section = content.sections.find((s) => s.label === "Career Highlights");

    expect(section?.kind).toBe("highlights");
    const items = section?.kind === "highlights" ? section.items : [];
    expect(items).toHaveLength(4);
    expect(items[0]).toEqual({ metric: "$250,000", description: "Annual savings through automation" });
    expect(items[3]).toEqual({ metric: "15% Under Budget", description: "Engagement delivered on schedule" });
  });

  it("never lets the pipe syntax reach the output", async () => {
    const { content } = await label(await jobrightish(MARKDOWN_HIGHLIGHTS));
    const rendered = JSON.stringify(content);
    expect(rendered).not.toContain(":---");
    expect(rendered).not.toContain("| $250,000");
  });

  // The alignment row carries no words and the output cannot contain it.
  // Counting it as placed would be the coverage report claiming text the
  // document does not have; counting it as dropped would put a false miss on
  // every Jobright file. It leaves both sides of the fraction.
  it("keeps coverage honest about the alignment row", async () => {
    const { coverage } = await label(await jobrightish(MARKDOWN_HIGHLIGHTS));
    expect(coverage.percent).toBe(100);
    expect(coverage.dropped).toEqual([]);
    expect(coverage.placed).toBe(coverage.totalParagraphs);
    // Ten paragraphs carry text; the alignment row is one of them and is not
    // counted on either side, so nine is both the total and the placed count.
    expect(coverage.totalParagraphs).toBe(9);
  });

  // Ugly and visible beats parsed wrong and silent: whatever is lost here is
  // keyword coverage, which is the entire value of the Jobright wording.
  it("falls back to verbatim paragraphs when the table does not line up", async () => {
    const rows = ["| $250,000 | 30% | 230 |", "| :--- | :--- | :--- |", "| Only one description |"];
    const { content, coverage } = await label(await jobrightish(rows.map((r) => para(r, 20))));
    const section = content.sections.find((s) => s.label === "Career Highlights");
    const items = section?.kind === "highlights" ? section.items : [];

    // How the paragraph rules happen to group these is not the point — the
    // point is that not one character of them is lost. Three metrics that never
    // paired with a description is exactly the case where guessing costs
    // keyword coverage, so nothing is guessed.
    const rendered = JSON.stringify(items);
    for (const row of rows) expect(rendered).toContain(row);
    expect(coverage.percent).toBe(100);
    expect(coverage.dropped).toEqual([]);
  });

  it("leaves the plain metric-and-description shapes alone", async () => {
    const plain = [para("$250,000: Annual savings through automation", 20), para("30%", 20), para("Lift in revenue capture", 20)];
    const { content, coverage } = await label(await jobrightish(plain));
    const section = content.sections.find((s) => s.label === "Career Highlights");
    const items = section?.kind === "highlights" ? section.items : [];

    expect(items[0]).toEqual({ metric: "$250,000", description: "Annual savings through automation" });
    expect(items[1]).toEqual({ metric: "30%", description: "Lift in revenue capture" });
    expect(coverage.percent).toBe(100);
  });
});

describe("a template that keeps name and contact in a page header", () => {
  const HEADER = [
    para("Alex Placeholder", 40),
    para("alex@example.invalid · 555-0100", 20),
  ].join("");

  const templateish = () =>
    makeDocx({
      header: HEADER,
      body: [
        para("Career Highlights", 22),
        table([
          [para("$250,000", 25), para("Annual savings through automation", 18)],
          [para("30%", 25), para("Lift in revenue capture", 18)],
        ]),
        para("Professional Experience", 22),
        para("Example Corp   Analyst   Jan 2024 – Present", 22),
        para("Did a measurable thing.", 21, { list: true }),
      ].join(""),
    });

  // Without this the body's only distinct prose size is the heading size, every
  // rank collapses onto it, and the render comes out with the name set in body
  // text — no hierarchy at all.
  it("takes the name and contact sizes from the header", async () => {
    const parts = await readDocxParts(await templateish());
    const spec = extractSpec(parts, extractParagraphs(parts.document));

    expect(spec.nameSize).toBe(20);
    expect(spec.contactSize).toBe(10);
    expect(spec.nameSize).toBeGreaterThan(spec.headingSize);
  });

  // The ranking assumes largest-is-the-name. With the name in the header that
  // assumption is off by one, and the heading takes the rank below it — which
  // came out smaller than body text on Joel's real template.
  it("keeps headings from ranking below body text", async () => {
    const parts = await readDocxParts(await templateish());
    const spec = extractSpec(parts, extractParagraphs(parts.document));

    expect(spec.headingSize).toBeGreaterThanOrEqual(spec.bodySize);
    expect(spec.nameSize).toBeGreaterThan(spec.headingSize);
  });

  it("still reports the header as a blocking ATS finding", async () => {
    const parts = await readDocxParts(await templateish());
    const findings = auditAts(parts, extractParagraphs(parts.document));
    expect(findings.find((f) => f.code === "header_footer_content")?.severity).toBe("blocking");
  });

  // Word leaves header1.xml behind after the text is cleared, and a first-page
  // header with no <w:titlePg/> is not displayed at all. Flagging the part
  // rather than its content reports a header the author cannot see and has
  // already dealt with.
  it("says nothing about a header part with no text in it", async () => {
    const parts = await readDocxParts(await makeDocx({ header: "<w:p/>", body: para("Summary", 22) }));
    expect(parts.headerFooterParts).toContain("word/header1.xml");
    expect(headerFooterText(parts.headerFooterXml["word/header1.xml"])).toBe("");
    expect(auditAts(parts, extractParagraphs(parts.document)).map((f) => f.code)).not.toContain(
      "header_footer_content"
    );
  });

  it("reads the highlights table as columns when the template draws one row", async () => {
    const parts = await readDocxParts(await templateish());
    expect(extractSpec(parts, extractParagraphs(parts.document)).highlightsLayout).toBe("columns");
  });

  it("reads a row-per-highlight table as rows", () => {
    const rows = `<w:tbl><w:tblPr/><w:tr><w:tc>${para("a")}</w:tc><w:tc>${para("b")}</w:tc></w:tr><w:tr><w:tc>${para(
      "c"
    )}</w:tc><w:tc>${para("d")}</w:tc></w:tr></w:tbl>`;
    expect(firstTableLayout(rows)).toBe("rows");
    expect(firstTableLayout("<w:body/>")).toBe("rows");
  });
});

describe("rendering highlights in the template's own layout", () => {
  const items = [
    { metric: "$250,000", description: "Annual savings through automation" },
    { metric: "30%", description: "Lift in revenue capture" },
  ];
  const content = { name: "Alex Placeholder", contact: "alex@example.invalid", sections: [{ kind: "highlights" as const, label: "Career Highlights", items }] };

  const xmlOf = async (buffer: Buffer) =>
    (await (await JSZip.loadAsync(buffer)).file("word/document.xml")!.async("string"));

  it("puts each highlight in its own cell, metric above description", async () => {
    const spec = { ...BASE_SPEC, highlightsLayout: "columns" as const };
    const xml = await xmlOf(await buildResumeDocx(content, spec));

    // One row, one cell per highlight.
    expect((xml.match(/<w:tr>/g) ?? []).length).toBe(1);
    expect((xml.match(/<w:tc>/g) ?? []).length).toBe(2);
    expect(xml.indexOf("$250,000")).toBeLessThan(xml.indexOf("Annual savings"));
  });

  it("puts one highlight per row when the template is shaped that way", async () => {
    const spec = { ...BASE_SPEC, highlightsLayout: "rows" as const };
    const xml = await xmlOf(await buildResumeDocx(content, spec));
    expect((xml.match(/<w:tr>/g) ?? []).length).toBe(2);
  });

  // The one permitted table stays the only one, in either layout.
  it("emits exactly one table either way", async () => {
    for (const layout of ["columns", "rows"] as const) {
      const xml = await xmlOf(await buildResumeDocx(content, { ...BASE_SPEC, highlightsLayout: layout }));
      expect((xml.match(/<w:tbl>/g) ?? []).length).toBe(1);
    }
  });
});

// The defaults, not a hand-written copy of them: these tests are about table
// shape, and a literal spec here only ever went stale when a field was added.
const BASE_SPEC = DEFAULT_SPEC;
