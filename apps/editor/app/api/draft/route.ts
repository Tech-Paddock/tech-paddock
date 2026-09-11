import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, getSharedClient } from "@/lib/supabase";
import { draftMessage, type Effort } from "@/lib/anthropic";

type DraftRequest = {
  contactId?: string;
  medium: "text" | "email" | "linkedin" | "slack";
  purpose: "ask" | "follow-up" | "decline" | "networking" | "job-outreach" | "other";
  tone?: string;
  effort: Effort;
  context?: string; // background to read before drafting; may not appear in the message
  input: string; // free-text: what the message needs to say
  threadNotes?: string; // passed by Pipeline Tracker
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as DraftRequest;

  if (!body.medium || !body.purpose || !body.effort || !body.input) {
    return NextResponse.json(
      { error: "medium, purpose, effort, and input are required" },
      { status: 400 }
    );
  }

  const supabase = getServiceClient();
  const shared = getSharedClient();

  const { data: styleGuide } = await supabase
    .from("style_guide")
    .select("content")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  let contact = null;
  let history: { medium: string; content: string; sent_at: string }[] = [];

  if (body.contactId) {
    const { data: contactData } = await shared
      .from("contacts")
      .select("*")
      .eq("id", body.contactId)
      .maybeSingle();
    contact = contactData;

    const { data: historyData } = await supabase
      .from("message_history")
      .select("medium, content, sent_at")
      .eq("contact_id", body.contactId)
      .order("sent_at", { ascending: false })
      .limit(5);
    history = historyData ?? [];
  }

  const systemPrompt = [
    "You draft outreach messages in the user's own voice. Return ONLY the message",
    "text, ready to send — no preamble, no explanation, no quotation marks around it.",
    "",
    "Style guide (follow these rules exactly):",
    styleGuide?.content ?? "(none saved yet — write in plain, direct, declarative language)",
  ].join("\n");

  const userPromptParts = [
    `Medium: ${body.medium}`,
    `Purpose: ${body.purpose}`,
    body.tone ? `Tone: ${body.tone}` : null,
    contact
      ? `Contact: ${contact.name}${contact.position ? `, ${contact.position}` : ""}${
          contact.org ? ` at ${contact.org}` : ""
        } (${contact.relationship_type ?? "relationship unknown"})`
      : null,
    history.length
      ? `Recent message history:\n${history.map((h) => `- [${h.medium}, ${h.sent_at}] ${h.content}`).join("\n")}`
      : null,
    body.threadNotes ? `Pipeline thread notes: ${body.threadNotes}` : null,
    // Background goes before the ask, so the model has read the situation by
    // the time it reaches what the message has to do. Not everything here
    // belongs in the message itself.
    body.context ? `Context to take into account:\n${body.context}` : null,
    `What this message needs to say: ${body.input}`,
  ].filter(Boolean);

  const draft = await draftMessage({
    systemPrompt,
    userPrompt: userPromptParts.join("\n\n"),
    effort: body.effort,
  });

  return NextResponse.json({ draft });
}
