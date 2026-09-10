import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { SEED_STYLE_GUIDE, refineStyleGuide } from "@/lib/styleGuide";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("style_guide")
    .select("*")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data) {
    return NextResponse.json({
      style_guide: { version: 0, content: SEED_STYLE_GUIDE, updated_at: null },
    });
  }

  return NextResponse.json({ style_guide: data });
}

// Training mode: takes raw writing samples and asks Claude to fold any new
// patterns into the existing style guide, then stores the result as the
// next version. The guide itself stays plain text rules, not the samples.
export async function POST(request: NextRequest) {
  const { samples } = await request.json();

  if (!samples || typeof samples !== "string" || samples.trim().length === 0) {
    return NextResponse.json({ error: "samples text is required" }, { status: 400 });
  }

  try {
    const styleGuide = await refineStyleGuide(samples);
    return NextResponse.json({ style_guide: styleGuide }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
