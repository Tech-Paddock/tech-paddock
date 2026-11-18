import { NextRequest, NextResponse } from "next/server";
import { sendCalendarEvent } from "@/lib/calendar-client";
import { getServiceClient } from "@/lib/supabase";
import { readJournal } from "@/lib/journal";
import { listOpen } from "@/lib/upcoming-db";
import { backfillEvents } from "@/lib/outlook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** How many events go at once. */
const BATCH = 5;

/**
 * The one-off backfill (#67): sends every open plan and repeat to the "Lando" calendar and every live log entry
 * from the last 30 days to "Lando log". Open it once, signed in, after Outlook is connected in Grid. It is behind
 * the gate like every route, and idempotent: one `source_id` is one event, so a second run updates and never
 * doubles. A GET so it can be opened in the browser; it writes nothing in Lando. The answer counts what Grid
 * took and what it did not (a number above zero in `failed` means run it again once Grid is up).
 */
export async function GET(req: NextRequest) {
  let events;
  try {
    const db = getServiceClient();
    const now = new Date();
    const [plans, journal] = await Promise.all([listOpen(db), readJournal(db, now)]);
    events = backfillEvents(plans, journal, now);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }

  let sent = 0;
  for (let i = 0; i < events.length; i += BATCH) {
    const results = await Promise.all(events.slice(i, i + BATCH).map((ev) => sendCalendarEvent(req, ev)));
    sent += results.filter((r) => r.ok).length;
  }
  const plans = events.filter((e) => e.app === "lando").length;
  return NextResponse.json({ ok: sent === events.length, sent, failed: events.length - sent, plans, log: events.length - plans });
}
