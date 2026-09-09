import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("pipeline_threads")
    .update({
      ...body,
      // A thread being touched means the stale check should get a fresh
      // shot at it next time — clear any open task so a new one can fire.
      open_task_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ thread: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getServiceClient();
  const { error } = await supabase.from("pipeline_threads").delete().eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
