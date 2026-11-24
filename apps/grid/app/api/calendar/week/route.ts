import { NextResponse } from "next/server";
import { supabaseStore } from "@/lib/calendar/store";
import { parseStart, weekEvents } from "@/lib/calendar/week";
import { Invalid } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * The household calendar's read side (contract: RULES.md, "Calendar contract"):
 * the Outlook events for the 7 days from `?start=YYYY-MM-DD`, from every calendar
 * on the account. Behind the gate like everything else; nothing is cached and no
 * title is logged. A failure is never an empty list.
 */
export async function GET(request: Request) {
  let start: string;
  try {
    start = parseStart(new URL(request.url).searchParams.get("start"));
  } catch (e) {
    if (e instanceof Invalid) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    throw e;
  }
  try {
    const r = await weekEvents({ store: supabaseStore() }, start);
    if (r.ok) return NextResponse.json({ ok: true, events: r.events });
    if (r.kind === "not_connected") return NextResponse.json({ ok: false, error: "outlook not connected" }, { status: 503 });
    if (r.kind === "busy") return NextResponse.json({ ok: false, error: "outlook busy, try again" }, { status: 503 });
    return NextResponse.json({ ok: false, error: `microsoft failed: ${r.short}` }, { status: 502 });
  } catch {
    return NextResponse.json({ ok: false, error: "calendar database unreachable" }, { status: 500 });
  }
}
