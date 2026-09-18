import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { serveDocx } from "@/lib/serveDocx";

export const dynamic = "force-dynamic";

/**
 * The document that went in — the Jobright export this render was built from.
 *
 * It has been stored since renders were first persisted and until now there was
 * no way to get it back out. It is the more useful of the two when something
 * looks wrong: the output is the template with this file's text in it, so a
 * missing line is answered by reading what was actually uploaded.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await getServiceClient()
    .from("renders")
    .select("source_file_path")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ code: "db_error", error: error.message }, { status: 500 });
  if (!data?.source_file_path) {
    return NextResponse.json({ code: "not_found", error: "No stored source for that render." }, { status: 404 });
  }

  return serveDocx(data.source_file_path as string);
}
