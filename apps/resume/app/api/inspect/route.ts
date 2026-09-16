import { NextRequest, NextResponse } from "next/server";
import { DocxReadError, readDocxParts } from "@/lib/docx/read";
import { extractParagraphs } from "@/lib/docx/paragraphs";
import { auditAts } from "@/lib/docx/ats";
import { outlineOf } from "@/lib/docx/outline";
import { compareContent } from "@/lib/docx/compare";

export const dynamic = "force-dynamic";

// Vercel caps a serverless request body well below this, but the check gives a
// real message instead of an opaque platform error. Worth knowing: a template
// with embedded fonts stored uncompressed can easily exceed it.
const MAX_BYTES = 4 * 1024 * 1024;

type Rejection = { status: number; code: string; error: string };

/** Null when the field is absent, which only `file` treats as an error. */
function takeDocx(form: FormData, field: string): File | Rejection | null {
  const file = form.get(field);
  if (!(file instanceof File)) return null;
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return {
      status: 415,
      code: "not_docx",
      error: `${file.name} isn't a .docx. Export it from Word or Jobright as .docx and try again.`,
    };
  }
  if (file.size > MAX_BYTES) {
    return {
      status: 413,
      code: "too_large",
      error: `${(file.size / 1024 / 1024).toFixed(1)}MB is over the ${MAX_BYTES / 1024 / 1024}MB limit. Embedded fonts are the usual cause — removing them typically takes a resume under 100KB.`,
    };
  }
  return file;
}

const isRejection = (v: File | Rejection | null): v is Rejection => v !== null && !(v instanceof File);

/**
 * Read a finished resume the way a parser will, and — when the document its text
 * came from is attached too — say whether any of that text failed to arrive.
 *
 * The comparison is the half that no word processor can do for you. Word shows
 * you what the page looks like; it cannot tell you that a bullet you meant to
 * carry across never made it, and Jobright's exact wording is the ATS keyword
 * optimisation. `source` is optional because reading a single document for
 * header content and stray tables is worth doing on its own.
 */
export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "bad_request", "Upload the file as multipart form data.");
  }

  const file = takeDocx(form, "file");
  if (file === null) return fail(400, "no_file", "No file was attached.");
  if (isRejection(file)) return fail(file.status, file.code, file.error);

  const source = takeDocx(form, "source");
  if (isRejection(source)) return fail(source.status, source.code, source.error);

  try {
    const parts = await readDocxParts(await file.arrayBuffer());
    const paragraphs = extractParagraphs(parts.document);

    // Read before the response is assembled so a source that cannot be parsed
    // fails the request outright, rather than returning a check with a silently
    // absent comparison — an unread source and an attached one must not look
    // the same.
    const content = source
      ? compareContent(extractParagraphs((await readDocxParts(await source.arrayBuffer())).document), paragraphs)
      : null;

    return NextResponse.json({
      filename: file.name,
      sizeBytes: file.size,
      paragraphCount: paragraphs.length,
      namedStyles: parts.styles ? (parts.styles.match(/w:styleId=/g) ?? []).length : 0,
      outline: outlineOf(paragraphs),
      findings: auditAts(parts, paragraphs),
      sourceFilename: source ? source.name : null,
      content,
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
