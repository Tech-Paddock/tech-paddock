import { NextRequest, NextResponse } from "next/server";
import { getSharedClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSharedClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contacts: data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const supabase = getSharedClient();

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      name: body.name,
      org: body.org ?? null,
      position: body.position ?? null,
      relationship_type: body.relationship_type ?? null,
      preferred_channel: body.preferred_channel ?? null,
      notes: body.notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data }, { status: 201 });
}
