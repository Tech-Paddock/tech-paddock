import { describe, expect, it } from "vitest";
import { readDocxParts } from "../lib/docx/read";
import { extractParagraphs } from "../lib/docx/paragraphs";
import { auditAts, headerFooterText } from "../lib/docx/ats";
import { getBodyInner, loadDocx } from "../lib/reskin/container";
import { splitBody } from "../lib/reskin/blocks";
import { extractSourceContent } from "../lib/reskin/extract";
import { linesTaken } from "../lib/reskin/generate";
import { makeDocx, para, table } from "./helpers/docx";

/**
 * Jobright renders Career Highlights as a markdown table and pastes it in as
 * three ordinary paragraphs. Verbatim from a real export, with the numbers and
 * wording replaced.
 *
 * These ran against the old paragraph labeller until TEC-63 retired it, which
 * left the live engine's pipe-table reader with no test of its own. They now
 * run against `extractSourceContent`, the reader a reformat actually uses.
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

async function extract(buffer: Buffer) {
  const { documentXml } = await loadDocx(buffer);
  return extractSourceContent(splitBody(getBodyInner(documentXml).bodyInner));
}

describe("Career Highlights arriving as a markdown table", () => {
  it("transposes the pipe rows into metric and description pairs", async () => {
    const content = await extract(await jobrightish(MARKDOWN_HIGHLIGHTS));
    expect(content.careerHighlights).toHaveLength(4);
    expect(content.careerHighlights?.[0]).toEqual({ stat: "$250,000", desc: "Annual savings through automation" });
    expect(content.careerHighlights?.[3]).toEqual({ stat: "15% Under Budget", desc: "Engagement delivered on schedule" });
  });

  it("never lets the pipe syntax into what the engine takes", async () => {
    const content = await extract(await jobrightish(MARKDOWN_HIGHLIGHTS));
    const taken = linesTaken(content).join("\n");
    expect(taken).not.toContain(":---");
    expect(taken).not.toContain("|");
  });

  // A guess here costs keyword coverage, so when the rows do not pair up the
  // reader returns null rather than a wrong pairing. **What happens after that
  // is a known defect, TEC-79:** the renderer reads null as "no highlights in
  // the input", logs `kept-unchanged`, and the verdict passes while these lines
  // reach the document nowhere. This test pins only the reader's refusal.
  it("reads nothing rather than guessing when the table does not line up", async () => {
    const rows = ["| $250,000 | 30% | 230 |", "| :--- | :--- | :--- |", "| Only one description |"];
    const content = await extract(await jobrightish(rows.map((r) => para(r, 20))));
    expect(content.careerHighlights).toBeNull();
  });

  it("reads one metric:description paragraph per highlight", async () => {
    const plain = [
      para("$250,000: Annual savings through automation", 20),
      para("30%: Lift in revenue capture", 20),
    ];
    const content = await extract(await jobrightish(plain));
    expect(content.careerHighlights).toEqual([
      { stat: "$250,000", desc: "Annual savings through automation" },
      { stat: "30%", desc: "Lift in revenue capture" },
    ]);
  });
});

describe("a template that keeps name and contact in a page header", () => {
  const HEADER = [para("Alex Placeholder", 40), para("alex@example.invalid · 555-0100", 20)].join("");

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

  it("reports the header as a blocking ATS finding", async () => {
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
});
