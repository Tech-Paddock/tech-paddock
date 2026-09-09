import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  const { company, title, start_date, end_date, display_order } = body;

  const update: Record<string, unknown> = {};
  if (company !== undefined) update.company = company;
  if (title !== undefined) update.title = title;
  if (start_date !== undefined) update.start_date = start_date;
  if (end_date !== undefined) update.end_date = end_date;
  if (display_order !== undefined) update.display_order = display_order;

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("resume_entries")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getServiceClient();
  const { error } = await supabase.from("resume_entries").delete().eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
