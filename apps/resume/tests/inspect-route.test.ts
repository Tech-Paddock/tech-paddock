import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../app/api/inspect/route";

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function upload(name: string, bytes: Buffer, type = DOCX_TYPE) {
  const body = new FormData();
  body.append("file", new File([new Uint8Array(bytes)], name, { type }));
  return new NextRequest("http://localhost/api/inspect", { method: "POST", body });
}

/** The finished document plus the one its text came from. */
function uploadPair(name: string, bytes: Buffer, sourceName: string, sourceBytes: Buffer) {
  const body = new FormData();
  body.append("file", new File([new Uint8Array(bytes)], name, { type: DOCX_TYPE }));
  body.append("source", new File([new Uint8Array(sourceBytes)], sourceName, { type: DOCX_TYPE }));
  return new NextRequest("http://localhost/api/inspect", { method: "POST", body });
}
const fixture = (n: string) => readFileSync(join(__dirname, "fixtures", n));

describe("POST /api/inspect", () => {
  it("reports structure and findings for a real Jobright export", async () => {
    const res = await POST(upload("jobright-sample.docx", fixture("jobright-sample.docx")));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outline.title).toBe("Jordan Rivers");
    expect(body.outline.sections.map((s: { heading: string }) => s.heading)).toContain("Professional Experience");
    expect(body.findings.length).toBeGreaterThan(0);
    expect(body.namedStyles).toBe(0); // Jobright ships an empty styles.xml
  });

  it("reports the template's blocking findings", async () => {
    const res = await POST(upload("template-sample.docx", fixture("template-sample.docx")));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.namedStyles).toBeGreaterThan(0);
    expect(body.findings.some((f: { severity: string }) => f.severity === "blocking")).toBe(true);
  });

  it("rejects a non-docx by extension before trying to unzip it", async () => {
    const res = await POST(upload("resume.pdf", Buffer.from("%PDF-1.7")));
    expect(res.status).toBe(415);
    expect((await res.json()).error).toContain("isn't a .docx");
  });

  it("rejects a .docx that is really something else, with a usable message", async () => {
    const res = await POST(upload("resume.docx", Buffer.from("%PDF-1.7 renamed")));
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("not_a_docx");
  });

  it("rejects an oversized file rather than letting the platform truncate it", async () => {
    const res = await POST(upload("huge.docx", Buffer.alloc(5 * 1024 * 1024)));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toContain("Embedded fonts");
  });

  it("rejects a request with no file", async () => {
    const res = await POST(new NextRequest("http://localhost/api/inspect", { method: "POST", body: new FormData() }));
    expect(res.status).toBe(400);
  });

  it("reports no comparison at all when only one document is attached", async () => {
    const res = await POST(upload("template-sample.docx", fixture("template-sample.docx")));
    const body = await res.json();
    expect(body.content).toBeNull();
    expect(body.sourceFilename).toBeNull();
  });

  it("compares the finished document against the source when both are attached", async () => {
    const res = await POST(
      uploadPair(
        "template-sample.docx",
        fixture("template-sample.docx"),
        "jobright-sample.docx",
        fixture("jobright-sample.docx")
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sourceFilename).toBe("jobright-sample.docx");
    expect(body.content.totalLines).toBeGreaterThan(0);
    expect(body.content.present + body.content.missing.length).toBe(body.content.totalLines);
    // Two unrelated documents: the point is that it says so rather than
    // reporting a comfortable number.
    expect(body.content.missing.length).toBeGreaterThan(0);
  });

  it("finds nothing missing when the document is compared against itself", async () => {
    const res = await POST(
      uploadPair(
        "jobright-sample.docx",
        fixture("jobright-sample.docx"),
        "jobright-sample.docx",
        fixture("jobright-sample.docx")
      )
    );
    const body = await res.json();
    expect(body.content.missing).toEqual([]);
    expect(body.content.percent).toBe(100);
  });

  // An unreadable source and an absent one must not produce the same response:
  // one is "you did not ask for a comparison", the other is "you asked and did
  // not get one", and a null in both places cannot tell them apart.
  it("fails the request when the attached source cannot be read", async () => {
    const res = await POST(
      uploadPair("jobright-sample.docx", fixture("jobright-sample.docx"), "source.docx", Buffer.from("not a zip"))
    );
    expect(res.status).toBe(422);
  });

  it("rejects a source that is not a .docx", async () => {
    const res = await POST(
      uploadPair("jobright-sample.docx", fixture("jobright-sample.docx"), "source.pdf", Buffer.from("%PDF-1.7"))
    );
    expect(res.status).toBe(415);
  });
});
