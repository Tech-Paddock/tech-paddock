import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("resume_highlights")
    .select("*")
    .order("display_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ highlights: data });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { content, display_order } = body;

  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("resume_highlights")
    .insert({ content, display_order: display_order ?? 0 })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ highlight: data }, { status: 201 });
}
