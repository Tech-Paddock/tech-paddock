import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const entryId = request.nextUrl.searchParams.get("entry_id");
  const supabase = getServiceClient();
  let query = supabase.from("resume_bullets").select("*").order("display_order", { ascending: true });
  if (entryId) query = query.eq("entry_id", entryId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bullets: data });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { entry_id, content, display_order } = body;

  if (!entry_id || !content) {
    return NextResponse.json({ error: "entry_id and content are required" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("resume_bullets")
    .insert({ entry_id, content, display_order: display_order ?? 0 })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bullet: data }, { status: 201 });
}
