import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Render history, newest first. */
export async function GET() {
  const { data, error } = await getServiceClient()
    .from("renders")
    .select("id, created_at, submitted_at, coverage, content_hash, template_id, output_file_path")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ code: "db_error", error: error.message }, { status: 500 });

  return NextResponse.json({ renders: data ?? [] });
}
