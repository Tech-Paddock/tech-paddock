import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readDocxParts } from "../lib/docx/read";
import { extractParagraphs } from "../lib/docx/paragraphs";
import { extractSpec } from "../lib/docx/spec";
import { labelParagraphs } from "../lib/docx/label";
import { buildResumeDocx } from "../lib/docx/build";
import { auditAts } from "../lib/docx/ats";

const fixture = (n: string) => readFileSync(join(__dirname, "fixtures", n));

async function roundTrip(sourceName: string, templateName: string) {
  const source = await readDocxParts(fixture(sourceName));
  const { content, coverage } = labelParagraphs(extractParagraphs(source.document));

  const template = await readDocxParts(fixture(templateName));
  const spec = extractSpec(template, extractParagraphs(template.document));

  const built = await buildResumeDocx(content, spec);
  const rebuilt = await readDocxParts(built);
  const rebuiltParas = extractParagraphs(rebuilt.document);

  return { content, coverage, spec, built, rebuilt, rebuiltParas };
}

describe("Jobright export rendered into the template", () => {
  it("produces a document that passes the ATS rules", async () => {
    const { rebuilt, rebuiltParas } = await roundTrip("jobright-sample.docx", "template-sample.docx");
    const blocking = auditAts(rebuilt, rebuiltParas).filter((f) => f.severity === "blocking");
    expect(blocking).toEqual([]);
  });

  it("puts contact details in the body and writes no page header", async () => {
    const { rebuilt, rebuiltParas } = await roundTrip("jobright-sample.docx", "template-sample.docx");
    expect(rebuilt.headerFooterParts).toEqual([]);
    const body = rebuiltParas.map((p) => p.text).join("\n");
    expect(body).toContain("jordan.rivers@example.com");
  });

  it("permits exactly one table, and draws section rules as borders not images", async () => {
    const { rebuilt, rebuiltParas } = await roundTrip("jobright-sample.docx", "template-sample.docx");
    expect((rebuilt.document.match(/<w:tbl>/g) ?? []).length).toBe(1);
    expect(rebuiltParas.some((p) => p.hasImage)).toBe(false);
    expect(rebuilt.document).toContain("<w:pBdr>");
  });

  it("carries every bullet through unchanged", async () => {
    const { content, rebuiltParas } = await roundTrip("jobright-sample.docx", "template-sample.docx");
    const out = rebuiltParas.map((p) => p.text.trim());
    for (const section of content.sections) {
      if (section.kind === "entries") {
        for (const entry of section.entries) {
          for (const b of entry.bullets) expect(out).toContain(b);
        }
      }
    }
  });

  it("keeps every section heading", async () => {
    const { content, rebuiltParas } = await roundTrip("jobright-sample.docx", "template-sample.docx");
    const out = rebuiltParas.map((p) => p.text.trim());
    for (const s of content.sections) expect(out).toContain(s.label);
  });

  it("is deterministic — the same inputs render the same document twice", async () => {
    const a = await roundTrip("jobright-sample.docx", "template-sample.docx");
    const b = await roundTrip("jobright-sample.docx", "template-sample.docx");
    // Compare document.xml rather than the zip: archive metadata carries
    // timestamps, but the document body is what has to be reproducible.
    expect(a.rebuilt.document).toBe(b.rebuilt.document);
  });

  it("adopts the template's page margins, not the source's", async () => {
    const { rebuilt, spec } = await roundTrip("jobright-sample.docx", "template-sample.docx");
    const left = /<w:pgMar\b[^>]*w:left="(\d+)"/.exec(rebuilt.document);
    expect(Number(left![1]) / 1440).toBeCloseTo(spec.margins.left, 2);
  });
});
