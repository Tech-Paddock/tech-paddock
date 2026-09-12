import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await getServiceClient()
    .from("brews")
    .delete()
    .eq("id", params.id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Deleting nothing is not success.
  if (!data) return NextResponse.json({ error: "No such brew." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
