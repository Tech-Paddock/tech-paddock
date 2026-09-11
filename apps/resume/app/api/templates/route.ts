import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { DocxReadError, readDocxParts } from "@/lib/docx/read";
import { extractParagraphs } from "@/lib/docx/paragraphs";
import { extractSpec } from "@/lib/docx/spec";
import { auditAts } from "@/lib/docx/ats";
import { StorageError, uploadDocx } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;

export async function GET() {
  const { data, error } = await getServiceClient()
    .from("templates")
    .select("id, version, name, spec, is_active, created_at")
    .order("version", { ascending: false });

  if (error) return NextResponse.json({ code: "db_error", error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}

/** Upload a template. Append-only: each upload is a new version, and the newest
 *  becomes active unless an older one has been deliberately pinned. */
export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "bad_request", "Upload the file as multipart form data.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "no_file", "No file was attached.");
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return fail(415, "not_docx", `${file.name} isn't a .docx.`);
  }
  if (file.size > MAX_BYTES) {
    return fail(413, "too_large", `${(file.size / 1024 / 1024).toFixed(1)}MB is over the ${MAX_BYTES / 1024 / 1024}MB limit. Embedded fonts are the usual cause.`);
  }

  const supabase = getServiceClient();

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const parts = await readDocxParts(bytes);
    const paragraphs = extractParagraphs(parts.document);
    const spec = extractSpec(parts, paragraphs);
    const findings = auditAts(parts, paragraphs);

    const { data: latest, error: latestError } = await supabase
      .from("templates")
      .select("version")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) return fail(500, "db_error", latestError.message);

    const version = (latest?.version ?? 0) + 1;

    // Storage first, then the row — reversing this leaves rows pointing at
    // files that were never written.
    const path = await uploadDocx("templates", file.name, bytes);

    // Only one row may be active, enforced by a partial unique index.
    const { error: clearError } = await supabase.from("templates").update({ is_active: false }).eq("is_active", true);
    if (clearError) return fail(500, "db_error", clearError.message);

    const { data, error } = await supabase
      .from("templates")
      .insert({ version, name: file.name, file_path: path, spec, is_active: true })
      .select("id, version, name, spec, is_active, created_at")
      .single();
    if (error) return fail(500, "db_error", error.message);

    // Findings describe the uploaded template, not the output. Worth seeing:
    // formatting is copied from this file, but its structural problems are not.
    return NextResponse.json({ template: data, findings }, { status: 201 });
  } catch (error) {
    if (error instanceof DocxReadError) return fail(422, error.code, error.message);
    if (error instanceof StorageError) return fail(502, "storage_error", error.message);
    console.error("template upload failed", error);
    return fail(500, "upload_failed", "Couldn't save that template.");
  }
}

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ code, error }, { status });
}
