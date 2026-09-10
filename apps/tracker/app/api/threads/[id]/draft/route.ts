import { NextResponse } from "next/server";
import { getServiceClient, getSharedClient } from "@/lib/supabase";

// Calls the Message Editor's /api/draft directly, passing the linked
// contact and this thread's notes — no re-entering anything. Always drafts
// a follow-up; that's the one button this is.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = getServiceClient();
  const shared = getSharedClient();

  const { data: thread, error: threadError } = await supabase
    .from("pipeline_threads")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (threadError) return NextResponse.json({ error: threadError.message }, { status: 500 });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (!thread.contact_id) {
    return NextResponse.json({ error: "This thread has no linked contact to draft to" }, { status: 400 });
  }

  const { data: contact } = await shared
    .from("contacts")
    .select("preferred_channel")
    .eq("id", thread.contact_id)
    .maybeSingle();

  const editorBaseUrl = process.env.EDITOR_BASE_URL;
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!editorBaseUrl || !internalSecret) {
    return NextResponse.json(
      { error: "EDITOR_BASE_URL and INTERNAL_API_SECRET must be set" },
      { status: 500 }
    );
  }

  const res = await fetch(`${editorBaseUrl}/api/draft`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": internalSecret,
    },
    body: JSON.stringify({
      contactId: thread.contact_id,
      medium: contact?.preferred_channel || "email",
      purpose: "follow-up",
      effort: "medium",
      input: thread.next_action || `Following up on the ${thread.company} thread.`,
      threadNotes: thread.notes || undefined,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: data.error ?? "Message Editor draft call failed" },
      { status: 502 }
    );
  }

  const data = await res.json();
  return NextResponse.json({ draft: data.draft });
}
