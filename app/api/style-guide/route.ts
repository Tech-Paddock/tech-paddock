import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { draftMessage } from "@/lib/anthropic";

const SEED_STYLE_GUIDE = `- Declarative language, not hedged phrasing
- One ask per message, never stacked
- No em dashes
- No "skill set" language
- Warm contacts get texts; cold professional contacts get a LinkedIn DM; email only when a direct address exists
- Odd-time scheduled sends read more human than round numbers`;

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

  const supabase = getServiceClient();
  const { data: current } = await supabase
    .from("style_guide")
    .select("*")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentContent = current?.content ?? SEED_STYLE_GUIDE;

  const refined = await draftMessage({
    effort: "high",
    systemPrompt:
      "You maintain a style guide for someone's outreach messages (text, email, LinkedIn, Slack). " +
      "You will be given the current style guide as a bulleted list of rules, and a batch of new " +
      "writing samples in their voice. Update the rules to reflect any consistent patterns visible " +
      "in the new samples: word choice, sentence length, tone, structure. Keep rules that still hold. " +
      "Output ONLY the updated bulleted list of rules, nothing else.",
    userPrompt: `Current style guide:\n${currentContent}\n\nNew writing samples:\n${samples}`,
  });

  const nextVersion = (current?.version ?? 0) + 1;

  const { data, error } = await supabase
    .from("style_guide")
    .insert({ version: nextVersion, content: refined.trim() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ style_guide: data }, { status: 201 });
}
