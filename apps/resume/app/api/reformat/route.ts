import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { DocxReadError, readDocxParts } from "@/lib/docx/read";
import { extractParagraphs } from "@/lib/docx/paragraphs";
import { auditAts } from "@/lib/docx/ats";
import { compareLines } from "@/lib/docx/compare";
import { linesTaken, reskin } from "@/lib/reskin/generate";
import { StorageError, downloadDocx, uploadDocx } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Pour a tailored resume's text into the template's formatting.
 *
 * **The template file is the substrate, not a description of one.** Its zip is
 * opened and only the body of `word/document.xml` is rewritten; every part that
 * decides how the document looks is carried through untouched. So there is no
 * spec to fall back to and no stored summary of the template that could be
 * stale: without the template's bytes there is no render, and saying so beats
 * producing a document that quietly looks wrong.
 */
export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "bad_request", "Upload the file as multipart form data.");
  }

  const source = form.get("source");
  if (!(source instanceof File)) return fail(400, "no_source", "Attach the tailored resume to reformat.");
  if (!source.name.toLowerCase().endsWith(".docx")) {
    return fail(415, "not_docx", `The resume (${source.name}) isn't a .docx.`);
  }
  if (source.size > MAX_BYTES) {
    return fail(
      413,
      "too_large",
      `The resume is ${(source.size / 1024 / 1024).toFixed(1)}MB, over the ${MAX_BYTES / 1024 / 1024}MB limit. Embedded fonts are the usual cause.`
    );
  }

  try {
    // **Every render is against the stored active template, and every render is
    // recorded.** A one-off template used to render here and save nothing —
    // removed on Joel's instruction 2026-09-17, because the two paths made every
    // question below conditional: whether a render has an id, whether it can be
    // reopened, whether it appears in history. A preview that cannot be found
    // again is a worse answer than uploading the template first.
    const { data: active, error } = await getServiceClient()
      .from("templates")
      .select("id, version, name, file_path")
      .eq("is_active", true)
      .maybeSingle();
    if (error) return fail(500, "db_error", error.message);
    if (!active) {
      return fail(409, "no_template", "No active template. Add one above — it saves and becomes active.");
    }
    if (typeof active.file_path !== "string" || !active.file_path) {
      return fail(409, "no_template_file", "That template has no stored file, and the file is what the render is built from. Upload it again.");
    }

    const templateBytes = Buffer.from(await downloadDocx(active.file_path));
    const templateId = active.id as string;
    const templateVersion = active.version as number;
    const templateLabel = `${active.name} (v${active.version})`;

    const sourceBytes = Buffer.from(await source.arrayBuffer());
    const { docx, changeLog, content } = await reskin(templateBytes, sourceBytes);

    // Audit and measure what we produced, not what we were given — this is the
    // document that reaches an employer.
    const rendered = await readDocxParts(docx);
    const renderedParas = extractParagraphs(rendered.document);
    const findings = auditAts(rendered, renderedParas);
    const coverage = compareLines(linesTaken(content), renderedParas);
    const contentHash = createHash("sha256").update(docx).digest("hex");

    const sourcePath = await uploadDocx("sources", source.name, sourceBytes);
    const outputPath = await uploadDocx("renders", outputName(source.name), docx);
    const inserted = await getServiceClient()
      .from("renders")
      .insert({
        template_id: templateId,
        // What this render was built from and what it did to it. The column held
        // an extracted spec when the renderer worked from one; there is no spec
        // now, and the honest snapshot is the template's identity plus the change
        // log — the template's own bytes stay on the template row, and the
        // output's bytes are stored, so the render stays reproducible from files
        // rather than from a description of them.
        //
        // It is also what lets a template be deleted without taking its renders
        // with it: the identity survives here after the row is gone.
        template_snapshot: {
          engine: "reskin",
          templateId,
          version: templateVersion,
          templateHash: createHash("sha256").update(templateBytes).digest("hex"),
          changeLog,
        },
        source_file_path: sourcePath,
        output_file_path: outputPath,
        parsed_content: content,
        coverage,
        content_hash: contentHash,
      })
      .select("id")
      .single();
    if (inserted.error) return fail(500, "db_error", inserted.error.message);

    return NextResponse.json({
      filename: outputName(source.name),
      renderId: inserted.data.id as string,
      templateLabel,
      contentHash,
      coverage,
      findings,
      changeLog,
      summary: {
        experience: content.experience.map((e) => ({ company: e.company, title: e.title, date: e.date, bullets: e.bullets.length })),
        highlights: content.careerHighlights?.length ?? 0,
        competencies: content.competencies?.length ?? 0,
        hasSummary: content.summary !== null,
      },
      docxBase64: docx.toString("base64"),
    });
  } catch (error) {
    if (error instanceof DocxReadError) return fail(422, error.code, error.message);
    if (error instanceof StorageError) return fail(502, "storage_error", error.message);
    console.error("reformat failed", error);
    return fail(500, "reformat_failed", "Couldn't reformat that document. It may be corrupt or password-protected.");
  }
}

const outputName = (sourceName: string) => `${sourceName.replace(/\.docx$/i, "")} (reformatted).docx`;

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ code, error }, { status });
}
