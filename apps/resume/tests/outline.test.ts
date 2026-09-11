import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readDocxParts } from "../lib/docx/read";
import { extractParagraphs } from "../lib/docx/paragraphs";
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
