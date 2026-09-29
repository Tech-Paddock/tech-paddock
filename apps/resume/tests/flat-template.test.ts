import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { getBodyInner, loadDocx } from "../lib/reskin/container";
import { extractText, joinBody, replaceInlineHeaderLine, replaceLabelledLine, splitBody, type Block } from "../lib/reskin/blocks";
import { extractSourceContent } from "../lib/reskin/extract";
import { renderIntoTemplate } from "../lib/reskin/render";
import { reskin } from "../lib/reskin/generate";
import type { SourceContent } from "../lib/reskin/types";

const fixture = (n: string) => readFileSync(join(__dirname, "fixtures", n));
const TEMPLATE = () => fixture("template-flat-sample.docx");
const SOURCE = () => fixture("jobright-sample.docx");

const bodyOf = async (bytes: Buffer) => getBodyInner((await loadDocx(bytes)).documentXml).bodyInner;
const blocksOf = async (bytes: Buffer) => splitBody(await bodyOf(bytes));

const content = (over: Partial<SourceContent> = {}): SourceContent => ({
  summary: null,
  careerHighlights: null,
  experience: [],
  competencies: null,
  ...over,
});

const para = (text: string) => ({ type: "p" as const, raw: `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>` });
const texts = (blocks: Block[]) => blocks.map((b) => extractText(b.raw).trim()).filter(Boolean);

/**
 * Core Competencies is the section `CLAUDE.md`'s one-table rule actually costs
 * something to obey, so the template's table was flattened into `Label:⇥items`
 * paragraphs and the renderer had to learn the shape.
 *
 * **Until it did, the failure was silent and total**: the renderer's only
 * competencies branch tested for a table and passed anything else straight
 * through, so a flattened template would have shipped the *template's* skills on
 * every application while the tailored ones were dropped — and reported 100%
 * coverage doing it, because coverage asks whether the input's text arrived, not
 * whether it was allowed to leave.
 */
describe("Core Competencies without a table", () => {
  it("writes one paragraph per input row, and introduces no table doing it", async () => {
    const { blocks, changeLog } = renderIntoTemplate(
      await blocksOf(TEMPLATE()),
      content({ competencies: [{ label: "Platform", items: "Alpha, Beta" }, { label: "Advisory", items: "Gamma" }, { label: "Tooling", items: "Delta" }] })
    );

    const out = joinBody(blocks);
    expect(out).toContain("Platform:");
    expect(out).toContain("Advisory:");
    expect(out).toContain("Tooling:");
    // The template's own competency text is gone — this is the assertion that
    // fails if the paragraph branch is ever removed.
    expect(out).not.toContain("Systems:");
    expect(out).not.toContain("Alpha Suite");
    expect((out.match(/<w:tbl\b/g) ?? []).length).toBe(1); // Career Highlights, and only that
    expect(changeLog.filter((c) => c.section === "Core Competencies" && c.action === "replaced")).toHaveLength(3);
  });

  it("keeps the label's own weight instead of setting the items in bold too", async () => {
    const { blocks } = renderIntoTemplate(
      await blocksOf(TEMPLATE()),
      content({ competencies: [{ label: "Platform", items: "Alpha, Beta" }] })
    );
    const line = blocks.map((b) => b.raw).find((raw) => raw.includes("Platform:"))!;

    // Two runs, and the bold one is the label. Written whole, both would carry
    // the first run's rPr and the entire line would come out bold.
    const runs = line.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) ?? [];
    const labelRun = runs.find((r) => r.includes("Platform:"))!;
    const itemsRun = runs.find((r) => r.includes("Alpha"))!;
    expect(/<w:b\s*\/>/.test(labelRun)).toBe(true);
    expect(/<w:b\s*\/>/.test(itemsRun)).toBe(false);
  });

  it("rewrites the input's commas to the separator the template already uses", async () => {
    const { blocks } = renderIntoTemplate(
      await blocksOf(TEMPLATE()),
      content({ competencies: [{ label: "Platform", items: "Alpha, Beta, Gamma" }] })
    );
    const line = blocks.map((b) => b.raw).find((raw) => raw.includes("Platform:"))!;
    expect(extractText(line)).toContain("Alpha · Beta · Gamma");
  });

  it("clones the last line for a surplus row, and says so", async () => {
    const { blocks, changeLog } = renderIntoTemplate(
      await blocksOf(TEMPLATE()),
      content({
        competencies: ["One", "Two", "Three", "Four"].map((label) => ({ label, items: "Alpha" })),
      })
    );
    expect(texts(blocks).some((t) => t.startsWith("Four:"))).toBe(true);
    expect(changeLog.some((c) => c.section === "Core Competencies" && c.action === "cloned-overflow")).toBe(true);
  });

  it("drops a template line the input has no row for, and says so", async () => {
    const { blocks, changeLog } = renderIntoTemplate(
      await blocksOf(TEMPLATE()),
      content({ competencies: [{ label: "Only", items: "Alpha" }] })
    );
    const lines = texts(blocks).filter((t) => /^[A-Z][a-z]+:/.test(t));
    expect(lines).toHaveLength(1);
    expect(changeLog.some((c) => c.section === "Core Competencies" && c.action === "template-trimmed")).toBe(true);
  });

  /**
   * A template writes the gap between label and items one of two ways: a tab run
   * of its own, or a trailing space inside the label run itself. The second kind
   * is what you get by typing `Salesforce: ` in Word, and overwriting that run
   * takes the space with it — so the line renders `Platform:Alpha Suite`.
   *
   * Found on the real template, not here. The gap is the template's to specify,
   * so it is carried over rather than supplied by this code.
   */
  it("keeps the space after the colon when the template writes it into the label run", () => {
    const { blocks } = renderIntoTemplate(
      [
        para("Core Competencies"),
        {
          type: "p",
          raw:
            "<w:p><w:pPr><w:numPr><w:ilvl w:val=\"0\"/><w:numId w:val=\"1\"/></w:numPr></w:pPr>" +
            '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Salesforce: </w:t></w:r>' +
            "<w:r><w:t>Sales Cloud · Service Cloud</w:t></w:r></w:p>",
        },
      ],
      content({ competencies: [{ label: "Platform", items: "Alpha Suite" }] })
    );

    expect(texts(blocks)).toContain("Platform: Alpha Suite");
  });

  it("keeps the template's own rows when the input has none", async () => {
    const { blocks, changeLog } = renderIntoTemplate(await blocksOf(TEMPLATE()), content());
    expect(joinBody(blocks)).toContain("Systems:");
    expect(
      changeLog.some((c) => c.section === "Core Competencies" && c.action === "not-found-in-input")
    ).toBe(true);
  });
});

/**
 * Moving the name and contact block out of `word/header1.xml` and into the body
 * is the fix for the template's worst ATS finding — many parsers never read a
 * header, and a resume a parser cannot attach a name or a phone number to is
 * worse off than one with an ugly heading.
 *
 * It also moved the renderer's target. "Replace the first non-empty paragraph
 * with the summary" was correct only while the first non-empty paragraph *was*
 * the summary; the moment the name sits above it, that rule deletes the name.
 * Nothing would have reported it, either: coverage checks that the input's text
 * arrived, never that the template's survived.
 */
describe("front matter in the body", () => {
  it("replaces the summary and leaves the name and contact line alone", async () => {
    const { docx } = await reskin(TEMPLATE(), SOURCE());
    const body = getBodyInner((await loadDocx(docx)).documentXml).bodyInner;
    const lines = texts(splitBody(body));

    expect(lines[0]).toBe("Jordan Avery");
    expect(lines[1]).toContain("Certified Platform Administrator");
    expect(lines[2]).toContain("jordan.avery@example.com");
    // The template's summary is gone and the source's is in its place — in the
    // fourth slot, not the first.
    expect(lines[3]).not.toContain("Platform consultant with a delivery background");
    expect(lines.slice(0, 3).join(" ")).not.toContain("Jobright");
  });

  it("reports an unplaced summary rather than writing it over the name", () => {
    const { blocks, changeLog } = renderIntoTemplate(
      [para("Jordan Avery"), para("Career Highlights"), para("$1")],
      content({ summary: "A tailored professional summary that has nowhere to go." })
    );

    expect(texts(blocks)[0]).toBe("Jordan Avery");
    expect(joinBody(blocks)).not.toContain("tailored professional summary");
    const entry = changeLog.find((c) => c.section === "Summary")!;
    expect(entry.action).toBe("not-found-in-input");
    expect(entry.detail).toMatch(/no summary paragraph/i);
  });

  /** TEC-31. Both the preamble slot and the Summary section were filled, so a
   *  template with a Summary heading shipped the summary twice. */
  it("writes the summary once, under the Summary heading, when the template has one", () => {
    const preambleProse = "A tagline above the headings long enough to read as ordinary prose rather than a label.";
    const { blocks, changeLog } = renderIntoTemplate(
      [
        para("Jordan Avery"),
        para(preambleProse),
        para("Summary"),
        para("The template's own summary, long enough to read as ordinary prose rather than a label."),
        para("Career Highlights"),
      ],
      content({ summary: "REPLACED SUMMARY TEXT" })
    );

    const lines = texts(blocks);
    expect(lines.filter((l) => l === "REPLACED SUMMARY TEXT")).toHaveLength(1);
    expect(lines).toEqual(["Jordan Avery", preambleProse, "Summary", "REPLACED SUMMARY TEXT", "Career Highlights"]);
    expect(changeLog.filter((c) => c.section === "Summary")).toHaveLength(1);
  });

  it("does not mistake the contact line for the summary", () => {
    const { blocks } = renderIntoTemplate(
      [
        para("Jordan Avery"),
        para("jordan.avery@example.com  ·  555.0100  ·  linkedin.com/in/example"),
        para("An existing template summary long enough to read as ordinary prose rather than a label."),
        para("Career Highlights"),
      ],
      content({ summary: "REPLACED SUMMARY TEXT" })
    );

    const lines = texts(blocks);
    expect(lines[1]).toContain("jordan.avery@example.com");
    expect(lines[2]).toBe("REPLACED SUMMARY TEXT");
  });
});

/**
 * Where a `<w:tab/>` is the only thing between the job title and the dates, the
 * two fields are separated by **no character at all** — the tab is an element,
 * not text. A tab-aware extractor (python-docx) copes; an extractor that simply
 * concatenates `<w:t>` elements, which is most of the simple ones, reads
 * `Sr. AdministratorNov 2022 - Present` and parses neither field.
 *
 * The template answers this with a trailing space on the title run, invisible
 * against a right tab stop. The renderer has to carry it over, or the fix is
 * undone on the first render.
 */
describe("the gap a template writes into a run", () => {
  const headerLine =
    '<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs></w:pPr>' +
    "<w:r><w:t>Lakeside Systems</w:t></w:r>" +
    '<w:r><w:t xml:space="preserve">   </w:t></w:r>' +
    '<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">Senior Administrator </w:t></w:r>' +
    "<w:r><w:tab/></w:r>" +
    "<w:r><w:t>Nov 2022 - Present</w:t></w:r></w:p>";

  it("survives a company, title and date rewrite", () => {
    const { raw, unplaced } = replaceInlineHeaderLine(headerLine, "Harbor Point", "Consultant", "Aug 2021 - Present");
    expect(unplaced).toEqual([]);

    // What an extractor that ignores <w:tab/> sees.
    const concatenated = [...raw.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join("");
    expect(concatenated).toBe("Harbor Point   Consultant Aug 2021 - Present");
    expect(concatenated).not.toContain("ConsultantOct");
  });
});

/**
 * TEC-66. Both run-granular rewrites rebuilt the paragraph as `pPr` + runs, so
 * a `<w:hyperlink>` around a run was dropped while its text survived: the line
 * read the same and the link was simply gone. The runs are now rewritten where
 * they sit, so the wrapper — and its relationship id — comes through intact.
 */
describe("a hyperlink on a line rewritten run by run", () => {
  const LINK_OPEN = '<w:hyperlink r:id="rId9" w:history="1">';

  it("keeps the link around the company on an experience header line", () => {
    const headerLine =
      '<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs></w:pPr>' +
      `${LINK_OPEN}<w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>Lakeside Systems</w:t></w:r></w:hyperlink>` +
      '<w:r><w:t xml:space="preserve">   </w:t></w:r>' +
      '<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">Senior Administrator </w:t></w:r>' +
      "<w:r><w:tab/></w:r>" +
      "<w:r><w:t>Nov 2022 - Present</w:t></w:r></w:p>";

    const { raw, unplaced } = replaceInlineHeaderLine(headerLine, "Harbor Point", "Consultant", "Aug 2021 - Present");

    expect(unplaced).toEqual([]);
    expect(raw).toBe(
      '<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs></w:pPr>' +
        `${LINK_OPEN}<w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t xml:space="preserve">Harbor Point</w:t></w:r></w:hyperlink>` +
        '<w:r><w:t xml:space="preserve">   </w:t></w:r>' +
        '<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">Consultant </w:t></w:r>' +
        "<w:r><w:tab/></w:r>" +
        '<w:r><w:t xml:space="preserve">Aug 2021 - Present</w:t></w:r></w:p>'
    );
  });

  it("keeps the link around the items on a Label:⇥items line", () => {
    const labelled =
      "<w:p><w:pPr><w:tabs><w:tab w:val=\"left\" w:pos=\"2160\"/></w:tabs></w:pPr>" +
      '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Platforms: </w:t></w:r>' +
      "<w:r><w:tab/></w:r>" +
      `${LINK_OPEN}<w:r><w:t>Alpha Suite</w:t></w:r></w:hyperlink></w:p>`;

    const { raw, unplaced } = replaceLabelledLine(labelled, "Systems:", "Beta Cloud, Gamma CRM");

    expect(unplaced).toEqual([]);
    expect(raw).toContain(`${LINK_OPEN}<w:r><w:t xml:space="preserve">Beta Cloud, Gamma CRM</w:t></w:r></w:hyperlink></w:p>`);
    expect(raw).toContain('<w:t xml:space="preserve">Systems: </w:t>');
    expect(extractText(raw)).toBe("Systems: \tBeta Cloud, Gamma CRM");
  });

  it("clears a surplus run inside the link rather than moving it out", () => {
    const split =
      "<w:p>" +
      `${LINK_OPEN}<w:r><w:t>Lake</w:t></w:r><w:r><w:t>side</w:t></w:r></w:hyperlink>` +
      '<w:r><w:rPr><w:i/></w:rPr><w:t>Administrator</w:t></w:r>' +
      "<w:r><w:tab/></w:r><w:r><w:t>2022</w:t></w:r></w:p>";

    const { raw } = replaceInlineHeaderLine(split, "Harbor Point", "Consultant", "2021");

    expect(raw).toContain(
      `${LINK_OPEN}<w:r><w:t xml:space="preserve">Harbor Point</w:t></w:r><w:r><w:t xml:space="preserve"></w:t></w:r></w:hyperlink>`
    );
  });
});

describe("what the current template's structure keeps", () => {
  it("leaves every part that defines the look byte-identical", async () => {
    const { docx } = await reskin(TEMPLATE(), SOURCE());
    const out = await JSZip.loadAsync(docx);
    const template = await JSZip.loadAsync(TEMPLATE());

    for (const part of ["word/styles.xml", "word/numbering.xml", "word/theme/theme1.xml", "word/settings.xml"]) {
      expect(await out.file(part)?.async("string"), part).toBe(await template.file(part)?.async("string"));
    }
  });

  /**
   * The fixture this replaced had every paragraph's text hoisted into its first
   * run, which is the one shape that cannot exercise run-granular replacement —
   * so the renderer fell back to composing the line whole and the test suite
   * called that a pass. Here each field has a run, and the fallback firing at
   * all is the failure.
   */
  it("places company, title and date in their own runs rather than composing the line", async () => {
    const { changeLog } = await reskin(TEMPLATE(), SOURCE());
    expect(changeLog.some((c) => /no separate run/.test(c.detail))).toBe(false);
  });
});

/**
 * TEC-31. A count mismatch between the input's highlights and the template's
 * cells was silent: surplus input was dropped and surplus template cells kept
 * their own figures, and nothing in the change log said either. The table's
 * cells are its layout, so none is added or removed — but each mismatch is a
 * line, and the actions are ones the verdict reads.
 */
describe("Career Highlights whose count differs from the template's", () => {
  const highlights = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ stat: `${i + 1}0%`, desc: `Representative outcome number ${i + 1}.` }));
  const logFor = async (n: number) =>
    renderIntoTemplate(await blocksOf(TEMPLATE()), content({ careerHighlights: highlights(n) })).changeLog.filter(
      (c) => c.section === "Career Highlights"
    );

  it("says which template cells kept their own text when the input has fewer", async () => {
    const kept = (await logFor(1)).filter((c) => c.action === "not-found-in-input");
    expect(kept.length).toBeGreaterThan(0);
    expect(kept[0].detail).toMatch(/^Highlight 2 keeps the template's own text/);
  });

  it("says which input highlights were dropped when the input has more", async () => {
    const cells = (await logFor(1)).filter((c) => c.action === "not-found-in-input").length + 1;
    const log = await logFor(cells + 2);
    const dropped = log.filter((c) => c.action === "input-dropped");
    expect(dropped).toHaveLength(2);
    expect(dropped[0].detail).toContain(`Highlight ${cells + 1}`);
    expect(log.some((c) => c.action === "not-found-in-input")).toBe(false);
  });
});
