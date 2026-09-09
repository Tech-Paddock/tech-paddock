import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

type CommitRequest = {
  contactId?: string;
  medium: string;
  purpose: string;
  tone?: string;
  content: string;
};

// Commits a final (possibly hand-edited) drafted message as a real sent
// message. Pure append to message_history — no LLM call here. The style
// guide only ever changes when you deliberately run a refine (Train tab),
// so it doesn't drift on a sample size of one every time you send a message.
export async function POST(request: NextRequest) {
  const body = (await request.json()) as CommitRequest;

  if (!body.medium || !body.purpose || !body.content?.trim()) {
    return NextResponse.json(
      { error: "medium, purpose, and content are required" },
      { status: 400 }
    );
  }

  const supabase = getServiceClient();

  const { error } = await supabase.from("message_history").insert({
    contact_id: body.contactId ?? null,
    medium: body.medium,
    purpose: body.purpose,
    tone: body.tone ?? null,
    content: body.content,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
