import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readDocxParts } from "../lib/docx/read";
import { extractParagraphs } from "../lib/docx/paragraphs";
import { extractSpec } from "../lib/docx/spec";

async function spec(name: string) {
  const parts = await readDocxParts(readFileSync(join(__dirname, "fixtures", name)));
  return extractSpec(parts, extractParagraphs(parts.document));
}

describe("template spec extraction", () => {
  it("reads the template's real page setup and type scale", async () => {
    const s = await spec("template-sample.docx");
    expect(s.margins.left).toBeCloseTo(0.75, 2);
    expect(s.margins.top).toBeCloseTo(0.625, 2);
    expect(s.nameSize).toBeGreaterThan(s.headingSize);
    expect(s.headingSize).toBeGreaterThanOrEqual(s.bodySize);
    expect(s.bodySize).toBeGreaterThan(6);
    expect(s.bodySize).toBeLessThan(14);
  });

  it("ranks the Jobright export's very different scale the same way", async () => {
    const s = await spec("jobright-sample.docx");
    expect(s.nameSize).toBeGreaterThan(s.headingSize);
    expect(s.headingSize).toBeGreaterThanOrEqual(s.bodySize);
    // Jobright's margins are far tighter than the template's.
    expect(s.margins.left).toBeLessThan(0.75);
  });

  it("keeps a bullet glyph and a usable font name", async () => {
    const s = await spec("template-sample.docx");
    expect(s.bulletGlyph.length).toBeGreaterThan(0);
    expect(s.font.length).toBeGreaterThan(0);
  });
});
