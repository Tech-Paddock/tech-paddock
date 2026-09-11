import { NextRequest, NextResponse } from "next/server";
import { DocxReadError, readDocxParts } from "@/lib/docx/read";
import { extractParagraphs } from "@/lib/docx/paragraphs";
import { extractSpec } from "@/lib/docx/spec";
import { labelParagraphs } from "@/lib/docx/label";
import { buildResumeDocx } from "@/lib/docx/build";
import { auditAts } from "@/lib/docx/ats";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "bad_request", "Upload both files as multipart form data.");
  }

  const source = form.get("source");
  const template = form.get("template");
  if (!(source instanceof File)) return fail(400, "no_source", "Attach the tailored resume to reformat.");
  if (!(template instanceof File)) return fail(400, "no_template", "Attach the template whose formatting to apply.");

  for (const [label, file] of [["resume", source], ["template", template]] as const) {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      return fail(415, "not_docx", `The ${label} (${file.name}) isn't a .docx.`);
    }
    if (file.size > MAX_BYTES) {
      return fail(
        413,
        "too_large",
        `The ${label} is ${(file.size / 1024 / 1024).toFixed(1)}MB, over the ${MAX_BYTES / 1024 / 1024}MB limit. Embedded fonts are the usual cause.`
      );
    }
  }

  try {
    const sourceParts = await readDocxParts(await source.arrayBuffer());
    const { content, coverage } = labelParagraphs(extractParagraphs(sourceParts.document));

    const templateParts = await readDocxParts(await template.arrayBuffer());
    const spec = extractSpec(templateParts, extractParagraphs(templateParts.document));

    const built = await buildResumeDocx(content, spec);

    // Audit what we produced, not what we were given — this is the document that
    // reaches an employer.
    const rebuilt = await readDocxParts(built);
    const findings = auditAts(rebuilt, extractParagraphs(rebuilt.document));

    return NextResponse.json({
      filename: outputName(source.name),
      coverage,
      findings,
      spec,
      summary: {
        name: content.name,
        contact: content.contact,
        sections: content.sections.map((s) => ({
          label: s.label,
          kind: s.kind,
          count:
            s.kind === "entries" ? s.entries.length : s.kind === "prose" ? 1 : s.kind === "bullets" ? s.items.length : s.items.length,
        })),
      },
      docxBase64: built.toString("base64"),
    });
  } catch (error) {
    if (error instanceof DocxReadError) return fail(422, error.code, error.message);
    console.error("reformat failed", error);
    return fail(500, "reformat_failed", "Couldn't reformat that document. It may be corrupt or password-protected.");
  }
}

function outputName(sourceName: string) {
  return `${sourceName.replace(/\.docx$/i, "")} (reformatted).docx`;
}

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ code, error }, { status });
}
