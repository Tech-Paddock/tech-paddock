import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Activate a template. Templates are never deleted, so there is no DELETE here. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  if (body?.is_active !== true) {
    return NextResponse.json(
      { code: "unsupported", error: "The only supported change is activating a template." },
      { status: 400 }
    );
  }

  const supabase = getServiceClient();

  const { error: clearError } = await supabase.from("templates").update({ is_active: false }).eq("is_active", true);
  if (clearError) return NextResponse.json({ code: "db_error", error: clearError.message }, { status: 500 });

  const { data, error } = await supabase
    .from("templates")
    .update({ is_active: true })
    .eq("id", params.id)
    .select("id, version, name, spec, is_active, created_at")
    .maybeSingle();

  if (error) return NextResponse.json({ code: "db_error", error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ code: "not_found", error: "No template with that id." }, { status: 404 });
  return NextResponse.json({ template: data });
}
