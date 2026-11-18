import { NextResponse } from "next/server";
import { failure } from "@/lib/api";
import { flush } from "@/lib/calendar/flush";
import { supabaseStore } from "@/lib/calendar/store";
import { parseCalendarEvent } from "@/lib/calendar/validate";
import { Invalid } from "@/lib/validate";

export const dynamic = "force-dynamic";
/** A flush may make a handful of Graph calls; the lock and the flush's own budget fit inside this. */
export const maxDuration = 60;

/**
 * The household calendar's one write route (contract: RULES.md, "Calendar
 * contract"). The event is appended to the outbox first, so it is kept even when
 * Outlook is down; then every unsent row is pushed. A 200 means the outbox has
 * it, not that Outlook does: `unsent` says how many rows still wait.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure(new Invalid("Expected JSON"));
  }
  try {
    const e = parseCalendarEvent(body);
    const store = supabaseStore();
    await store.append({ app: e.app, source_id: e.source_id, op: e.op, payload: e });
    try {
      const r = await flush({ store });
      return NextResponse.json({ ok: true, unsent: r.unsent });
    } catch {
      // The event is safe in the outbox; the push is retried by the next flush.
      return NextResponse.json({ ok: true, unsent: null });
    }
  } catch (e) {
    return failure(e);
  }
}
