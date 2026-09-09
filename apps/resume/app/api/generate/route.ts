import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { buildResumeDocx } from "@/lib/docx-builder";

// Always generate fresh from current content — never statically prerendered.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getServiceClient();

  const { data: template, error: templateError } = await supabase
    .from("resume_templates")
    .select("*")
    .eq("is_active", true)
    .single();

  if (templateError || !template) {
    return NextResponse.json({ error: "No active template. Set one before generating." }, { status: 400 });
  }

  const [{ data: entries, error: entriesError }, { data: bullets, error: bulletsError }, { data: highlights, error: highlightsError }] =
    await Promise.all([
      supabase.from("resume_entries").select("*").order("display_order", { ascending: true }),
      supabase.from("resume_bullets").select("*").order("display_order", { ascending: true }),
      supabase.from("resume_highlights").select("*").order("display_order", { ascending: true }),
    ]);

  if (entriesError || bulletsError || highlightsError) {
    return NextResponse.json({ error: "Failed to load resume content" }, { status: 500 });
  }

  const entriesWithBullets = (entries ?? []).map((entry) => ({
    ...entry,
    bullets: (bullets ?? []).filter((b) => b.entry_id === entry.id),
  }));

  const buffer = await buildResumeDocx({
    template,
    entries: entriesWithBullets,
    highlights: highlights ?? [],
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="resume.docx"`,
    },
  });
}
