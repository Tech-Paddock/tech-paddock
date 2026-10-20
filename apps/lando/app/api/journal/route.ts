import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { listPeople, readJournal } from "@/lib/journal";

export const dynamic = "force-dynamic";

/**
 * The screen's one read. `since` is the phone's local midnight, so "today" is
 * the phone's day, never the server's. A failure is a 503 and the screen keeps
 * saying so; it never shows an empty day.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("since");
  const since = raw ? new Date(raw) : null;
  if (!since || Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "since must be a time" }, { status: 400 });
  }
  try {
    const db = getServiceClient();
    const [events, people] = await Promise.all([readJournal(db, since), listPeople(db)]);
    return NextResponse.json({ events, people });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}
