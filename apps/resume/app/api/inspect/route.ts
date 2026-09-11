import { NextRequest, NextResponse } from "next/server";
import { DocxReadError, readDocxParts } from "@/lib/docx/read";
import { extractParagraphs } from "@/lib/docx/paragraphs";
import { auditAts } from "@/lib/docx/ats";
import { outlineOf } from "@/lib/docx/outline";

export const dynamic = "force-dynamic";

// Vercel caps a serverless request body well below this, but the check gives a
// real message instead of an opaque platform error. Worth knowing: a template
// with embedded fonts stored uncompressed can easily exceed it.
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "bad_request", "Upload the file as multipart form data.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return fail(400, "no_file", "No file was attached.");
  }
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return fail(415, "not_docx", `${file.name} isn't a .docx. Export it from Word or Jobright as .docx and try again.`);
  }
  if (file.size > MAX_BYTES) {
    return fail(
      413,
      "too_large",
      `${(file.size / 1024 / 1024).toFixed(1)}MB is over the ${MAX_BYTES / 1024 / 1024}MB limit. Embedded fonts are the usual cause — removing them typically takes a resume under 100KB.`
    );
  }

  try {
    const parts = await readDocxParts(await file.arrayBuffer());
    const paragraphs = extractParagraphs(parts.document);
    return NextResponse.json({
      filename: file.name,
      sizeBytes: file.size,
      paragraphCount: paragraphs.length,
      namedStyles: parts.styles ? (parts.styles.match(/w:styleId=/g) ?? []).length : 0,
      outline: outlineOf(paragraphs),
      findings: auditAts(parts, paragraphs),
    });
  } catch (error) {
    if (error instanceof DocxReadError) return fail(422, error.code, error.message);
    console.error("inspect failed", error);
    return fail(500, "read_failed", "Couldn't read that document. It may be corrupt or password-protected.");
  }
}

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ code, error }, { status });
}
