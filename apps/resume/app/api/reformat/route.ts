import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { DocxReadError, readDocxParts } from "@/lib/docx/read";
import { extractParagraphs } from "@/lib/docx/paragraphs";
import { extractSpec, type TemplateSpec } from "@/lib/docx/spec";
import { labelParagraphs } from "@/lib/docx/label";
import { buildResumeDocx } from "@/lib/docx/build";
import { auditAts } from "@/lib/docx/ats";
import { StorageError, uploadDocx } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "bad_request", "Upload the file as multipart form data.");
  }

  const source = form.get("source");
  const adHocTemplate = form.get("template");
  if (!(source instanceof File)) return fail(400, "no_source", "Attach the tailored resume to reformat.");

  for (const [label, file] of [["resume", source], ["template", adHocTemplate]] as const) {
    if (!(file instanceof File)) continue;
    if (!file.name.toLowerCase().endsWith(".docx")) return fail(415, "not_docx", `The ${label} (${file.name}) isn't a .docx.`);
    if (file.size > MAX_BYTES) {
      return fail(413, "too_large", `The ${label} is ${(file.size / 1024 / 1024).toFixed(1)}MB, over the ${MAX_BYTES / 1024 / 1024}MB limit. Embedded fonts are the usual cause.`);
    }
  }

  try {
    // A one-off template file renders a preview and saves nothing. Without one
    // we use the stored active template, and that render becomes a record —
    // renders reference a stored template, so a preview has nothing to point at.
    let spec: TemplateSpec;
    let templateId: string | null = null;
    let templateLabel: string;

    if (adHocTemplate instanceof File) {
      const parts = await readDocxParts(await adHocTemplate.arrayBuffer());
      spec = extractSpec(parts, extractParagraphs(parts.document));
      templateLabel = `${adHocTemplate.name} (one-off, not saved)`;
    } else {
      // Only reached when we actually need the database — a one-off template
      // renders without touching it.
      const { data: active, error } = await getServiceClient()
        .from("templates")
        .select("id, version, name, spec")
        .eq("is_active", true)
        .maybeSingle();
      if (error) return fail(500, "db_error", error.message);
      if (!active) {
        return fail(409, "no_template", "No active template. Upload one on the Templates tab, or attach a one-off template here.");
      }
      spec = active.spec as TemplateSpec;
      templateId = active.id as string;
      templateLabel = `${active.name} (v${active.version})`;
    }

    const sourceBytes = Buffer.from(await source.arrayBuffer());
    const sourceParts = await readDocxParts(sourceBytes);
    const { content, coverage } = labelParagraphs(extractParagraphs(sourceParts.document));

    const built = await buildResumeDocx(content, spec);

    // Audit what we produced, not what we were given — this is the document
    // that reaches an employer.
    const rebuilt = await readDocxParts(built);
    const findings = auditAts(rebuilt, extractParagraphs(rebuilt.document));
    const contentHash = createHash("sha256").update(built).digest("hex");

    let renderId: string | null = null;
    if (templateId) {
      const sourcePath = await uploadDocx("sources", source.name, sourceBytes);
      const outputPath = await uploadDocx("renders", outputName(source.name), built);
      const { data, error } = await getServiceClient()
        .from("renders")
        .insert({
          template_id: templateId,
          template_snapshot: spec,
          source_file_path: sourcePath,
          output_file_path: outputPath,
          parsed_content: content,
          coverage,
          content_hash: contentHash,
        })
        .select("id")
        .single();
      if (error) return fail(500, "db_error", error.message);
      renderId = data.id as string;
    }

    return NextResponse.json({
      filename: outputName(source.name),
      renderId,
      templateLabel,
      contentHash,
      coverage,
      findings,
      summary: {
        name: content.name,
        contact: content.contact,
        sections: content.sections.map((s) => ({
          label: s.label,
          kind: s.kind,
          count: s.kind === "entries" ? s.entries.length : s.kind === "prose" ? 1 : s.items.length,
        })),
      },
      docxBase64: built.toString("base64"),
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
