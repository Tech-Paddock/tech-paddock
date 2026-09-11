import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { StorageError, downloadDocx } from "@/lib/storage";

export const dynamic = "force-dynamic";

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Re-download exactly the bytes that were rendered, not a fresh render of the
 *  same inputs — the point of keeping the file is answering what was sent. */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await getServiceClient()
    .from("renders")
    .select("output_file_path, created_at")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ code: "db_error", error: error.message }, { status: 500 });
  if (!data?.output_file_path) {
    return NextResponse.json({ code: "not_found", error: "No stored file for that render." }, { status: 404 });
  }

  try {
    const bytes = await downloadDocx(data.output_file_path as string);
    const name = (data.output_file_path as string).split("/").pop() ?? "resume.docx";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": DOCX_TYPE,
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (err) {
    if (err instanceof StorageError) return NextResponse.json({ code: "storage_error", error: err.message }, { status: 502 });
    throw err;
  }
}
