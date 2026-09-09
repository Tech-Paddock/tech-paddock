import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("pipeline_threads")
    .select("*")
    .order("last_touch_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ threads: data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("pipeline_threads")
    .insert({
      contact_id: body.contact_id ?? null,
      company: body.company,
      stage: body.stage ?? "Applied",
      last_touch_date: body.last_touch_date ?? new Date().toISOString().slice(0, 10),
      next_action: body.next_action ?? null,
      notes: body.notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ thread: data }, { status: 201 });
}
