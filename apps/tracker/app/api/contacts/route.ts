import { NextResponse } from "next/server";
import { getSharedClient } from "@/lib/supabase";

// Read-only here — contact creation/editing happens in Message Editor.
// Tracker just needs the list to link threads to.
export async function GET() {
  const supabase = getSharedClient();
  const { data, error } = await supabase.from("contacts").select("*").order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contacts: data });
}
