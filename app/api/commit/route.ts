import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { refineStyleGuide } from "@/lib/styleGuide";

type CommitRequest = {
  contactId?: string;
  medium: string;
  purpose: string;
  tone?: string;
  content: string;
};

// Commits a final (possibly hand-edited) drafted message as a real sent
// message: logs it to message_history (so it becomes context for future
// drafts to this contact) and folds it into the style guide as a tagged
// training sample. Deliberately excludes the original ask/prompt and the
// contact's identity from the training sample — voice patterns live in the
// output text, and medium/purpose tags already give the model the
// situational context it needs, without bloating each sample.
export async function POST(request: NextRequest) {
  const body = (await request.json()) as CommitRequest;

  if (!body.medium || !body.purpose || !body.content?.trim()) {
    return NextResponse.json(
      { error: "medium, purpose, and content are required" },
      { status: 400 }
    );
  }

  const supabase = getServiceClient();

  if (body.contactId) {
    const { error } = await supabase.from("message_history").insert({
      contact_id: body.contactId,
      medium: body.medium,
      content: body.content,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tag = ["medium: " + body.medium, "purpose: " + body.purpose, body.tone ? "tone: " + body.tone : null]
    .filter(Boolean)
    .join(", ");
  const sample = `[${tag}]\n${body.content}`;

  try {
    const styleGuide = await refineStyleGuide(sample);
    return NextResponse.json({ style_guide: styleGuide, logged: !!body.contactId }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
