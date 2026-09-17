import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readDocxParts } from "../lib/docx/read";
import { extractParagraphs, type Para } from "../lib/docx/paragraphs";
import { outlineOf } from "../lib/docx/outline";

const outline = async (name: string) =>
  outlineOf(extractParagraphs((await readDocxParts(readFileSync(join(__dirname, "fixtures", name)))).document));

describe("outline", () => {
  it("reads the Jobright export's sections in order", async () => {
    const o = await outline("jobright-sample.docx");
    expect(o.title).toBe("Jordan Rivers");
    expect(o.sections.map((s) => s.heading)).toEqual([
      "Summary",
      "Career Highlights",
      "Professional Experience",
      "Core Competencies",
      "Education",
      "Certifications",
    ]);
    expect(o.sections.find((s) => s.heading === "Professional Experience")!.bullets).toBeGreaterThan(10);
  });

  it("works on the template too, whose size scale is completely different", async () => {
    const o = await outline("template-sample.docx");
    expect(o.sections.length).toBeGreaterThan(2);
    expect(o.sections.some((s) => s.heading.toLowerCase().includes("competencies"))).toBe(true);
  });
});

/**
 * The template in use sets its section headings and its `Company Title Dates`
 * lines at the **same point size**, and this page used to decide what a heading
 * was by size alone. So every job line opened a new section, and the real
 * heading above them closed at nothing:
 *
 *     Professional Experience     0 lines
 *     Lakeside Systems …          6 lines · 6 bullets
 *     Harbor Point Group …        4 lines · 4 bullets
 *
 * On the one page whose whole purpose is to show what was understood. Joel asked
 * why it read zero; this is that.
 */
describe("a job line is not a section heading", () => {
  it("keeps the jobs inside Professional Experience", async () => {
    const o = await outline("template-flat-sample.docx");
    const headings = o.sections.map((s) => s.heading);

    expect(headings).toEqual([
      "Career Highlights",
      "Professional Experience",
      "Core Competencies",
      "Education",
      "Certifications",
      "Hobbies",
    ]);
    expect(headings.some((h) => /Lakeside|Harbor|Tanner|Ridgeway|Fairmont/.test(h))).toBe(false);

    const experience = o.sections.find((s) => s.heading === "Professional Experience")!;
    expect(experience.lines).toBeGreaterThan(0);
    expect(experience.entries).toBe(5);
    expect(experience.bullets).toBeGreaterThan(10);
  });

  // The count the broken version showed by accident, kept on purpose: it is the
  // most useful number in the section and the fix should not cost it.
  it("counts jobs only where there are jobs", async () => {
    const o = await outline("template-flat-sample.docx");
    for (const s of o.sections.filter((x) => x.heading !== "Professional Experience")) {
      expect(s.entries, s.heading).toBe(0);
    }
  });

  it("still finds the name when it is in the body", async () => {
    expect((await outline("template-flat-sample.docx")).title).toBe("Jordan Avery");
  });

  /**
   * A name appears once, headings repeat. **No fixture exercises this** — all
   * three put the name in the body as the single largest size, so "largest" and
   * "largest appearing once" agree on every real file here. It is tested
   * synthetically because the rule is stated that way on purpose: a body with no
   * name should report none rather than promoting a section heading into the
   * slot, and nothing else would catch that if the rule drifted back.
   */
  it("reports no name when nothing in the body is bigger than the headings", () => {
    const para = (text: string, size: number): Para => ({
      index: 0, text, size, bold: false, italic: false, listId: null, styleId: null,
      hasImage: false, inTable: false, inContentControl: false, cell: null, runs: [],
    });

    const o = outlineOf([
      para("Professional Experience", 22),
      para("A line of body copy under it.", 20),
      para("Education", 22),
      para("A line of body copy under that.", 20),
    ]);

    expect(o.title).toBeNull();
    expect(o.sections.map((s) => s.heading)).toEqual(["Professional Experience", "Education"]);
  });
});
