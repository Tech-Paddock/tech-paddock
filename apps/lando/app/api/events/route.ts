import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { Conflict, writeEvent } from "@/lib/journal";
import { InvalidEvent } from "@/lib/events";
import { eventsAfterEntry, pushAfterSave } from "@/lib/outlook";

export const dynamic = "force-dynamic";

/**
 * A tap, a correction or a delete. All three are an insert; nothing is ever updated. A saved one then goes to the
 * "Lando log" Outlook calendar (#67); that never fails the save.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  try {
    const event = await writeEvent(getServiceClient(), body);
    await pushAfterSave(req, () => eventsAfterEntry(event));
    return NextResponse.json({ event });
  } catch (e) {
    if (e instanceof InvalidEvent) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof Conflict) return NextResponse.json({ error: e.message }, { status: 409 });
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}
