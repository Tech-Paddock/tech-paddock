import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { DocxReadError, readDocxParts } from "@/lib/docx/read";
import { extractParagraphs } from "@/lib/docx/paragraphs";
import { extractSpec, normalizeSpec, type TemplateSpec } from "@/lib/docx/spec";
import { labelParagraphs } from "@/lib/docx/label";
import { buildResumeDocx } from "@/lib/docx/build";
import { auditAts } from "@/lib/docx/ats";
import { StorageError, downloadDocx, uploadDocx } from "@/lib/storage";

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
    let specSource: SpecSource = "file";
    let specNote: string | null = null;

    if (adHocTemplate instanceof File) {
      const parts = await readDocxParts(await adHocTemplate.arrayBuffer());
      spec = extractSpec(parts, extractParagraphs(parts.document));
      templateLabel = `${adHocTemplate.name} (one-off, not saved)`;
    } else {
      // Only reached when we actually need the database — a one-off template
      // renders without touching it.
      const { data: active, error } = await getServiceClient()
        .from("templates")
        .select("id, version, name, spec, file_path")
        .eq("is_active", true)
        .maybeSingle();
      if (error) return fail(500, "db_error", error.message);
      if (!active) {
        return fail(409, "no_template", "No active template. Upload one on the Templates tab, or attach a one-off template here.");
      }
      const resolved = await resolveSpec(active as StoredTemplate);
      spec = resolved.spec;
      specSource = resolved.source;
      specNote = resolved.note;
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
      specSource,
      specNote,
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

type SpecSource = "file" | "stored";
type StoredTemplate = { spec: unknown; file_path: unknown };

/**
 * The active template's formatting, read out of the template file itself.
 *
 * `resume.templates.spec` is written once, at upload, by whichever release was
 * running then. Trusting it meant that every change to what a spec can express —
 * the highlights layout, the header-derived sizes, then all of the colour — did
 * nothing until the template was uploaded again, by hand, with no prompt anywhere
 * saying so. Three times in a week the answer to "why didn't that work" was a
 * re-upload. Reading the stored `.docx` instead ends that: the file is the
 * template, so extraction happens against the file.
 *
 * Reproducibility is unaffected, and that is a property of the schema rather than
 * an assumption here. Every render stores `template_snapshot` — "the spec as it
 * was at render time" — so what a given render was built with stays recorded even
 * though it is no longer frozen on the template row.
 *
 * **The stored spec stays as the fallback, and falling back is never silent.** It
 * is not a guess: it was extracted from these same bytes, so it is a true if
 * possibly older description of this template. A storage blip should not block a
 * render being sent to an employer tonight. But an invisible fallback is how "the
 * fix didn't work" happens again, so the caller is told which one it got and why.
 */
async function resolveSpec(active: StoredTemplate): Promise<{
  spec: TemplateSpec;
  source: SpecSource;
  note: string | null;
}> {
  const stored = () => normalizeSpec(active.spec);
  // file_path is `not null` in the schema, so this is a guard against a shape
  // that should not exist rather than a case with a story behind it.
  const path = typeof active.file_path === "string" && active.file_path ? active.file_path : null;
  if (!path) {
    return {
      spec: stored(),
      source: "stored",
      note: "That template has no stored file, so its formatting came from the spec saved when it was uploaded.",
    };
  }

  try {
    const parts = await readDocxParts(await downloadDocx(path));
    return { spec: extractSpec(parts, extractParagraphs(parts.document)), source: "file", note: null };
  } catch (err) {
    // Only the two failures that mean "those bytes were no use". Anything else is
    // a bug and belongs in the 500 the caller already has.
    if (!(err instanceof StorageError) && !(err instanceof DocxReadError)) throw err;
    return {
      spec: stored(),
      source: "stored",
      note: `Couldn't read the stored template file, so the formatting came from the spec saved when it was uploaded, which may be older than the file. ${err.message}`,
    };
  }
}

const outputName = (sourceName: string) => `${sourceName.replace(/\.docx$/i, "")} (reformatted).docx`;

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ code, error }, { status });
}
