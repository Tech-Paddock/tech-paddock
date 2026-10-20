import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { addPerson } from "@/lib/journal";
import { InvalidEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

/** Add someone who logs. Names live here and in the database, never in the repo. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { display_name?: unknown } | null;
  try {
    const person = await addPerson(getServiceClient(), body?.display_name);
    return NextResponse.json({ person });
  } catch (e) {
    if (e instanceof InvalidEvent) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}
