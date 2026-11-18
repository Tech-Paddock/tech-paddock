import { NextResponse } from "next/server";
import { routineEvent, sendQuietly, senderFor, taskEvent } from "@/lib/calendar-map";
import { readCalendarSources } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * One-off, behind the gate like everything else (#68): sends every live routine
 * and every open dated task to the Grid calendar. Safe to run twice (one
 * `source_id` is one event). Run it once after Outlook is connected; the answer
 * is counts only, never a title.
 */
export async function POST(request: Request) {
  try {
    const { routines, tasks } = await readCalendarSources();
    const send = senderFor(request);
    let sent = 0;
    let failed = 0;
    for (const e of [...routines.map((r) => routineEvent(r)), ...tasks.map(taskEvent)]) {
      if (await sendQuietly(send, e)) sent++;
      else failed++;
    }
    return NextResponse.json({ ok: failed === 0, routines: routines.length, tasks: tasks.length, sent, failed });
  } catch {
    return NextResponse.json({ error: "Could not read what to send" }, { status: 500 });
  }
}
