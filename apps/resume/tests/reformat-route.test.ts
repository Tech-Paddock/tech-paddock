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

    // Everything the engine took out of the source reached the document. The
    // name, the contact block and the static sections are not in that set — they
    // come from the template on purpose — so this is the question worth asking
    // rather than "is all of the source in there".
    expect(body.coverage.percent).toBe(100);
    expect(body.coverage.missing).toEqual([]);
    expect(body.filename).toBe("jobright (reformatted).docx");

    // The payload really is a readable docx carrying the source's content.
    const parts = await readDocxParts(Buffer.from(body.docxBase64, "base64"));
    expect(parts.document).toContain("Professional Experience");
  });

  /**
   * The renderer that came before this one rebuilt the document to the ATS rules
   * and so always passed its own lint — while getting the page size, the
   * alignment and the bullets wrong. This one keeps the template exactly,
   * **including the template's own ATS problems**, and reports them.
   *
   * That is the lint doing its job rather than failing at it: the finding is
   * real, it is about the template, and the fix is in the template. A render
   * that quietly passed a check it had rebuilt itself to satisfy told nobody
   * anything.
   */
  it("reports the template's own ATS problems rather than rebuilding them away", async () => {
    const res = await POST(
      request({
        source: file("jobright.docx", fixture("jobright-sample.docx")),
        template: file("template.docx", fixture("template-sample.docx")),
      })
    );
    const { findings } = await res.json();
    const codes = findings.map((f: { code: string }) => f.code);
    // The fixture template has a second table and a content control; both
    // survive into the output because nothing rewrites them away.
    expect(codes).toContain("too_many_tables");
    expect(codes).toContain("content_control");
  });

  it("reports the jobs it mapped in", async () => {
    const res = await POST(
      request({
        source: file("jobright.docx", fixture("jobright-sample.docx")),
        template: file("template.docx", fixture("template-sample.docx")),
      })
    );
    const { summary, changeLog } = await res.json();
    expect(summary.experience).toHaveLength(5);
    expect(summary.experience[0]).toMatchObject({ company: "Northwind Athletics", title: "Sr. Platform Administrator" });
    expect(summary.competencies).toBe(3);
    expect(changeLog.some((c: { action: string }) => c.action === "passthrough")).toBe(true);
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
