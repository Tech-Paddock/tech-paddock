import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { serveDocx } from "@/lib/serveDocx";

export const dynamic = "force-dynamic";

/** The document that came out. Its sibling at `/source` is what went in. */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await getServiceClient()
    .from("renders")
    .select("output_file_path")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ code: "db_error", error: error.message }, { status: 500 });
  if (!data?.output_file_path) {
    return NextResponse.json({ code: "not_found", error: "No stored file for that render." }, { status: 404 });
  }

  return serveDocx(data.output_file_path as string);
}
