import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  const { content, display_order } = body;

  const update: Record<string, unknown> = {};
  if (content !== undefined) update.content = content;
  if (display_order !== undefined) update.display_order = display_order;

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("resume_bullets")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bullet: data });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getServiceClient();
  const { error } = await supabase.from("resume_bullets").delete().eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
