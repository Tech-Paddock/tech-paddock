import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { StorageError, downloadDocx } from "@/lib/storage";

export const dynamic = "force-dynamic";

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Download a template's original .docx — the bytes as uploaded, never a
 * regenerated file.
 *
 * The template is a deliverable in its own right: it doubles as the
 * general-purpose resume to hand someone when there is no specific job. That is
 * why the original bytes are kept rather than only the extracted spec, and this
 * is the route that makes keeping them useful. An archived template still
 * downloads — archiving hides it from the list, it does not retire the file.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await getServiceClient()
    .from("templates")
    .select("file_path, name")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ code: "db_error", error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ code: "not_found", error: "No template with that id." }, { status: 404 });
  if (!data.file_path) {
    return NextResponse.json({ code: "not_found", error: "That template has no stored file." }, { status: 404 });
  }

  try {
    const bytes = await downloadDocx(data.file_path as string);
    // Prefer the uploaded filename over the storage key, which carries a
    // timestamp prefix and a slugged name that nobody wants to see.
    const name = (data.name as string | null) ?? (data.file_path as string).split("/").pop() ?? "template.docx";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": DOCX_TYPE,
        "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
      },
    });
  } catch (err) {
    if (err instanceof StorageError) {
      return NextResponse.json({ code: "storage_error", error: err.message }, { status: 502 });
    }
    throw err;
  }
}
