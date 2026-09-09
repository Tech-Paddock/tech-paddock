import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

const HISTORY_LIMIT = 30;

// Read-only: the accumulated log of committed sent messages. The Train tab
// uses this to build a refinement batch instead of requiring samples to be
// pasted in by hand every time.
export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("message_history")
    .select("medium, purpose, tone, content, sent_at")
    .order("sent_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data ?? [] });
}
