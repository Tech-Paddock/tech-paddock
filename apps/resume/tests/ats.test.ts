import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readDocxParts } from "../lib/docx/read";
import { extractParagraphs } from "../lib/docx/paragraphs";
import { auditAts } from "../lib/docx/ats";

async function audit(name: string) {
  const parts = await readDocxParts(readFileSync(join(__dirname, "fixtures", name)));
  return auditAts(parts, extractParagraphs(parts.document));
}
const codes = (f: Awaited<ReturnType<typeof audit>>) => f.map((x) => x.code).sort();

describe("ATS lint", () => {
  // A lint that finds nothing proves nothing. Both fixtures have known defects,
  // so these assert it actually catches them.
  it("flags the image-drawn section rules in the Jobright export", async () => {
    expect(codes(await audit("jobright-sample.docx"))).toContain("images");
  });

  it("flags the content control and the extra table in the template", async () => {
    const found = codes(await audit("template-sample.docx"));
    expect(found).toContain("content_control");
    expect(found).toContain("too_many_tables");
  });

  it("reports blocking findings distinctly from warnings", async () => {
    const findings = await audit("template-sample.docx");
    expect(findings.some((f) => f.severity === "blocking")).toBe(true);
    expect(findings.every((f) => f.message.length > 20)).toBe(true);
  });
});
