import { NextResponse } from "next/server";
import { flush } from "@/lib/calendar/flush";
import { supabaseStore } from "@/lib/calendar/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** "Send now" on /more: pushes every unsent row again. Nothing is read from the request. */
export async function POST() {
  try {
    const r = await flush({ store: supabaseStore() });
    return NextResponse.json({ ok: true, busy: r.busy, sent: r.sent, unsent: r.unsent });
  } catch {
    return NextResponse.json({ error: "Could not reach the calendar database." }, { status: 500 });
  }
}
