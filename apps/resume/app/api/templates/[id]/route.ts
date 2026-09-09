import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  const { name, font, font_size, margins, section_order, spacing, highlights_style, is_active } = body;

  const supabase = getServiceClient();

  // Old templates are never deleted and switching which one is active is a
  // deliberate action, never automatic — so explicitly unset the previous
  // active row rather than relying on an upsert.
  if (is_active === true) {
    const { error: deactivateError } = await supabase
      .from("resume_templates")
      .update({ is_active: false })
      .eq("is_active", true)
      .neq("id", params.id);
    if (deactivateError) return NextResponse.json({ error: deactivateError.message }, { status: 500 });
  }

  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (font !== undefined) update.font = font;
  if (font_size !== undefined) update.font_size = font_size;
  if (margins !== undefined) update.margins = margins;
  if (section_order !== undefined) update.section_order = section_order;
  if (spacing !== undefined) update.spacing = spacing;
  if (highlights_style !== undefined) update.highlights_style = highlights_style;
  if (is_active !== undefined) update.is_active = is_active;

  const { data, error } = await supabase
    .from("resume_templates")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}
