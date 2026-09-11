import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readDocxParts } from "../lib/docx/read";
import { extractParagraphs } from "../lib/docx/paragraphs";
import { labelParagraphs } from "../lib/docx/label";

const label = async (name: string) =>
  labelParagraphs(extractParagraphs((await readDocxParts(readFileSync(join(__dirname, "fixtures", name)))).document));

describe("labelling a Jobright export", () => {
  it("places every paragraph — a dropped line is lost keyword coverage", async () => {
    const { coverage } = await label("jobright-sample.docx");
    expect(coverage.dropped).toEqual([]);
    expect(coverage.percent).toBe(100);
  });

  it("pulls out the name and contact line", async () => {
    const { content } = await label("jobright-sample.docx");
    expect(content.name).toBe("Jordan Rivers");
    expect(content.contact).toContain("@");
  });

  it("splits employers, dates and bullets", async () => {
    const { content } = await label("jobright-sample.docx");
    const experience = content.sections.find((s) => s.label === "Professional Experience");
    expect(experience?.kind).toBe("entries");
    if (experience?.kind !== "entries") throw new Error("expected entries");
    expect(experience.entries.length).toBeGreaterThanOrEqual(5);
    const first = experience.entries[0];
    expect(first.company).toBe("Northwind Athletics");
    expect(first.dates).toMatch(/Jan\s*2026/);
    expect(first.bullets.length).toBeGreaterThan(3);
    // The date must not be left fused onto the company name.
    expect(first.company).not.toMatch(/\d{4}/);
  });

  it("reads highlights as metric and description pairs", async () => {
    const { content } = await label("jobright-sample.docx");
    const highlights = content.sections.find((s) => s.label === "Career Highlights");
    if (highlights?.kind !== "highlights") throw new Error("expected highlights");
    expect(highlights.items.length).toBe(4);
    expect(highlights.items[0].metric).toBe("$250,000");
    expect(highlights.items[0].description.length).toBeGreaterThan(10);
  });

  it("never invents text — every string appears in the source", async () => {
    const parts = await readDocxParts(readFileSync(join(__dirname, "fixtures", "jobright-sample.docx")));
    const source = extractParagraphs(parts.document).map((p) => p.text).join("\n");
    const { content } = labelParagraphs(extractParagraphs(parts.document));
    for (const section of content.sections) {
      if (section.kind === "entries") {
        for (const e of section.entries) for (const b of e.bullets) expect(source).toContain(b);
      }
      if (section.kind === "bullets") for (const i of section.items) expect(source).toContain(i);
    }
  });
});
