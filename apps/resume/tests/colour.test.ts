import { describe, expect, it } from "vitest";
import { readDocxParts } from "../lib/docx/read";
import { extractParagraphs } from "../lib/docx/paragraphs";
import { DEFAULT_SPEC, dominantColor, extractSpec, isTrioLine, normalizeSpec } from "../lib/docx/spec";
import { makeDocx, para, runs, stylesWithDefaults, table } from "./helpers/docx";

/**
 * Reproducing the template's colours, and the three sizes its entry line uses.
 *
 * Every output before this was black, because `headingColor` and `nameColor` were
 * declared, consumed by the builder, and never assigned by anything — and the
 * employer, title and dates were one size with bold and italic hardcoded.
 *
 * The document here is written in full rather than loaded from a fixture, so the
 * exact numbers and colours under test are visible in the diff, and no real name
 * or employer can hide in it. Its shape is Joel's template's: a 20pt accent name,
 * a contact line that is partly accent and partly grey, 11pt accent headings, a
 * one-row Career Highlights table, and an entry line of three differently set runs
 * over a near-black document default.
 */
const ACCENT = "1F3864";
const GREY = "666666";
const MUTED = "444444";
const NEAR_BLACK = "1A1A1A";

const ENTRY_LINE = runs([
  { text: "Fabrikam", sz: 22, bold: true },
  // No size of its own: 10.5pt comes from docDefaults and nowhere else.
  { text: "   Senior Consultant", color: GREY, italic: true },
  { text: "Jan 2024 – Present", sz: 20, color: GREY },
]);

const joelish = () =>
  makeDocx({
    styles: stylesWithDefaults(NEAR_BLACK, 21),
    body: [
      runs([{ text: "Alex Placeholder", sz: 40, color: ACCENT, bold: true }]),
      runs([
        { text: "alex@example.invalid", sz: 20, color: ACCENT, link: true },
        { text: "  ·  555-0100  ·  ", sz: 20, color: GREY },
        { text: "linkedin.com/in/placeholder", sz: 20, color: ACCENT, link: true },
      ]),
      runs([{ text: "Career Highlights", sz: 22, color: ACCENT, bold: true }]),
      table([
        [
          runs([{ text: "$250,000", sz: 25, color: ACCENT, bold: true }]),
          runs([{ text: "Annual savings through automation", sz: 18, color: MUTED }]),
        ],
        [
          runs([{ text: "30%", sz: 25, color: ACCENT, bold: true }]),
          runs([{ text: "Lift in revenue capture", sz: 18, color: MUTED }]),
        ],
      ]),
      runs([{ text: "Professional Experience", sz: 22, color: ACCENT, bold: true }]),
      ENTRY_LINE,
      para("Did a measurable thing.", undefined, { list: true }),
    ].join(""),
  });

const specOf = async (buffer: Buffer) => {
  const parts = await readDocxParts(buffer);
  return extractSpec(parts, extractParagraphs(parts.document));
};

describe("reading a template's colours", () => {
  it("takes the name, headings and contact line from the template", async () => {
    const spec = await specOf(await joelish());

    expect(spec.nameColor).toBe(ACCENT);
    expect(spec.headingColor).toBe(ACCENT);
    // Grey, not the accent, even though the accent covers more of the line: both
    // accent stretches are hyperlinks, and a link's colour belongs to the link.
    // The output renders the whole line as one run, and rendering a phone number
    // in link blue is not what the template looks like.
    expect(spec.contactColor).toBe(GREY);
  });

  // The one that made everything black: a near-black document default is not the
  // absence of a colour, and leaving it unread put pure black on every run that
  // stated none — which is every bullet and every line of prose.
  it("reads the colour a run inherits when it states none", async () => {
    expect((await specOf(await joelish())).defaultColor).toBe(NEAR_BLACK);
  });

  it("reads no colour at all from a template that sets none", async () => {
    const spec = await specOf(await makeDocx({ body: [para("Alex Placeholder", 40), para("Summary", 22)].join("") }));
    expect(spec.defaultColor).toBeNull();
    expect(spec.nameColor).toBeNull();
    expect(spec.headingColor).toBeNull();
  });

  // `w:val="auto"` is Word deciding for itself. Copying it into the output as a
  // colour would be inventing one.
  it("treats an automatic colour as no colour", async () => {
    const spec = await specOf(
      await makeDocx({
        styles: `<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:color w:val="auto"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`,
        body: runs([{ text: "Alex Placeholder", sz: 40, color: "auto" }]),
      })
    );
    expect(spec.defaultColor).toBeNull();
    expect(spec.nameColor).toBeNull();
  });

  // A line that is nothing but links still has a colour, so links are the fallback
  // rather than simply skipped.
  it("still reads a colour off a line that is entirely a link", async () => {
    const parts = await readDocxParts(
      await makeDocx({ body: runs([{ text: "alex@example.invalid", sz: 20, color: ACCENT, link: true }]) })
    );
    expect(dominantColor(extractParagraphs(parts.document))).toBe(ACCENT);
  });

  // Word splits runs on its own, mid-word, for spellcheck and revision ids — Joel's
  // template splits "Salesforce Certified Administrator" across two. Counting runs
  // would let that split outvote the colour most of the line is actually set in.
  it("weighs a colour by how much text it covers, not by how many runs carry it", async () => {
    const parts = await readDocxParts(
      await makeDocx({
        body: runs([
          { text: "a", color: GREY },
          { text: "b", color: GREY },
          { text: "c", color: GREY },
          { text: "a much longer stretch of text than all of those put together", color: ACCENT },
        ]),
      })
    );
    expect(dominantColor(extractParagraphs(parts.document))).toBe(ACCENT);
  });
});

describe("reading the employer, title and dates", () => {
  // `{ ...DEFAULT_SPEC }` shares its nested objects, so writing to
  // `spec.entry.company` used to write into the defaults themselves — and every
  // template extracted afterwards in the same process would inherit whatever the
  // last one measured. A long-lived server process is exactly where that bites.
  it("leaves the defaults alone while extracting", async () => {
    const before = JSON.stringify([DEFAULT_SPEC.entry, DEFAULT_SPEC.highlight, DEFAULT_SPEC.margins]);
    const spec = await specOf(await joelish());

    expect(spec.entry.company.size).toBe(11);
    expect(JSON.stringify([DEFAULT_SPEC.entry, DEFAULT_SPEC.highlight, DEFAULT_SPEC.margins])).toBe(before);
    expect(DEFAULT_SPEC.entry.company.color).toBeNull();
  });

  it("reads all three from the template's own entry line", async () => {
    const { entry } = await specOf(await joelish());

    expect(entry.company).toEqual({ size: 11, color: NEAR_BLACK, bold: true, italic: false });
    // 10.5pt is stated nowhere on the run — it is the document default, and
    // resolving it is the only way the title comes out the size it looks.
    expect(entry.title).toEqual({ size: 10.5, color: GREY, bold: false, italic: true });
    expect(entry.dates).toEqual({ size: 10, color: GREY, bold: false, italic: false });
  });

  // The ranked guess put the employer at 10pt on Joel's real template while the
  // document plainly says 11. One spec cannot hold both answers.
  it("brings entrySize into line with what the entry line measures", async () => {
    const spec = await specOf(await joelish());
    expect(spec.entrySize).toBe(spec.entry.company.size);
    expect(spec.entrySize).toBe(11);
  });

  // An employer's first run is set at the heading size in this template, so
  // "the first paragraph at the heading size" can land on one. It would take its
  // colour from the grey title beside it and every heading would come out grey.
  it("does not mistake an entry line for a heading", async () => {
    const parts = await readDocxParts(await joelish());
    const paras = extractParagraphs(parts.document);
    const entry = paras.find((p) => p.text.includes("Senior Consultant"));
    const heading = paras.find((p) => p.text.trim() === "Professional Experience");

    expect(entry && isTrioLine(entry)).toBe(true);
    expect(heading && isTrioLine(heading)).toBe(false);
  });

  it("falls back to the ranked size when no entry line can be measured", async () => {
    const spec = await specOf(
      await makeDocx({ body: [para("Alex Placeholder", 40), para("Summary", 22), para("Prose", 20)].join("") })
    );
    expect(spec.entry.company.size).toBe(spec.entrySize);
    expect(spec.entry.company.bold).toBe(true);
    expect(spec.entry.title.italic).toBe(true);
  });
});

describe("reading the Career Highlights cell", () => {
  it("reads the metric and the description out of the first table", async () => {
    const { highlight } = await specOf(await joelish());

    expect(highlight.metric).toEqual({ size: 12.5, color: ACCENT, bold: true, italic: false });
    expect(highlight.description).toEqual({ size: 9, color: MUTED, bold: false, italic: false });
  });

  // In a rows template the pair is two cells of one row, not two paragraphs of
  // one cell, so reading "the first cell's second paragraph" finds nothing.
  it("reads a row-per-highlight table from its two cells", async () => {
    const cell = (body: string) => `<w:tc>${body}</w:tc>`;
    const row = (a: string, b: string) => `<w:tr>${cell(a)}${cell(b)}</w:tr>`;
    const { highlight } = await specOf(
      await makeDocx({
        body: [
          para("Career Highlights", 22),
          `<w:tbl><w:tblPr/>${row(
            runs([{ text: "$250,000", sz: 25, color: ACCENT, bold: true }]),
            runs([{ text: "Annual savings", sz: 18, color: MUTED }])
          )}${row(
            runs([{ text: "30%", sz: 25, color: ACCENT, bold: true }]),
            runs([{ text: "Lift in revenue", sz: 18, color: MUTED }])
          )}</w:tbl>`,
        ].join(""),
      })
    );

    expect(highlight.metric.color).toBe(ACCENT);
    expect(highlight.description.color).toBe(MUTED);
    expect(highlight.description.size).toBe(9);
  });
});

describe("a spec stored before these fields existed", () => {
  // resume.templates.spec is JSON with no version. A spec written by an earlier
  // release has no `entry` object, and `spec.entry.company` off it throws — the
  // render fails outright rather than looking wrong.
  const OLD = {
    font: "Calibri",
    bodySize: 10,
    headingSize: 11,
    nameSize: 16,
    contactSize: 9,
    entrySize: 12,
    headingBold: true,
    headingColor: null,
    nameColor: null,
    margins: { top: 0.6, right: 0.75, bottom: 0.6, left: 0.75 },
    spacing: { before: 40, after: 40, line: null },
    bulletGlyph: "•",
    highlightsStyle: "table",
  };

  it("keeps the employer at the size that spec was rendering it", () => {
    // Not the body size, which is what a missing size would fall back to.
    expect(normalizeSpec(OLD).entry.company.size).toBe(12);
    expect(normalizeSpec(OLD).entry.company.bold).toBe(true);
  });

  it("keeps everything the old spec did say", () => {
    const spec = normalizeSpec(OLD);
    expect(spec.bodySize).toBe(10);
    expect(spec.margins.top).toBe(0.6);
    expect(spec.bulletGlyph).toBe("•");
    // Absent from the old spec, so the default stands.
    expect(spec.highlightsLayout).toBe("rows");
    expect(spec.defaultColor).toBeNull();
  });

  it("copes with a row that has no spec at all", () => {
    expect(normalizeSpec(null)).toEqual(DEFAULT_SPEC);
    expect(normalizeSpec(undefined)).toEqual(DEFAULT_SPEC);
  });
});
