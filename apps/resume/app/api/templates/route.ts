import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from("resume_templates").select("*").order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { name, font, font_size, margins, section_order, spacing, highlights_style, is_active } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const supabase = getServiceClient();

  // Switching the active template is deliberate: unset any current one first,
  // since only one row may have is_active = true (enforced by a DB constraint too).
  if (is_active) {
    const { error: deactivateError } = await supabase
      .from("resume_templates")
      .update({ is_active: false })
      .eq("is_active", true);
    if (deactivateError) return NextResponse.json({ error: deactivateError.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("resume_templates")
    .insert({
      name,
      font: font ?? null,
      font_size: font_size ?? null,
      margins: margins ?? null,
      section_order: section_order ?? null,
      spacing: spacing ?? null,
      highlights_style: highlights_style ?? "list",
      is_active: !!is_active,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data }, { status: 201 });
}
