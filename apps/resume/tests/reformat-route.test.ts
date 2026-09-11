import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../app/api/reformat/route";
import { readDocxParts } from "../lib/docx/read";

const fixture = (n: string) => readFileSync(join(__dirname, "fixtures", n));
const file = (name: string, bytes: Buffer) => new File([new Uint8Array(bytes)], name);

function request(fields: Record<string, File | undefined>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v) body.append(k, v);
  return new NextRequest("http://localhost/api/reformat", { method: "POST", body });
}

describe("POST /api/reformat", () => {
  it("returns a document, full coverage, and a clean ATS result", async () => {
    const res = await POST(
      request({
        source: file("jobright.docx", fixture("jobright-sample.docx")),
        template: file("template.docx", fixture("template-sample.docx")),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.coverage.percent).toBe(100);
    expect(body.coverage.dropped).toEqual([]);
    expect(body.findings.filter((f: { severity: string }) => f.severity === "blocking")).toEqual([]);
    expect(body.filename).toBe("jobright (reformatted).docx");

    // The payload really is a readable docx carrying the source's content.
    const parts = await readDocxParts(Buffer.from(body.docxBase64, "base64"));
    expect(parts.document).toContain("Professional Experience");
    expect(parts.headerFooterParts).toEqual([]);
  });

  it("reports which sections it found and how big each is", async () => {
    const res = await POST(
      request({
        source: file("jobright.docx", fixture("jobright-sample.docx")),
        template: file("template.docx", fixture("template-sample.docx")),
      })
    );
    const { summary } = await res.json();
    expect(summary.name).toBe("Jordan Rivers");
    const experience = summary.sections.find((s: { label: string }) => s.label === "Professional Experience");
    expect(experience.kind).toBe("entries");
    expect(experience.count).toBeGreaterThanOrEqual(5);
  });

  it("names which of the two files is missing", async () => {
    const res = await POST(request({ template: file("template.docx", fixture("template-sample.docx")) }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("no_source");
  });

  it("names which of the two files is the wrong type", async () => {
    const res = await POST(
      request({
        source: file("resume.pdf", Buffer.from("%PDF")),
        template: file("template.docx", fixture("template-sample.docx")),
      })
    );
    expect(res.status).toBe(415);
    expect((await res.json()).error).toContain("resume");
  });
});
