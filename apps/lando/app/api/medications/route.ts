import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { addMedication } from "@/lib/journal";
import { InvalidEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

/**
 * Add a medication to the pick list (the Medication tab's "Add a medication…", TEC-199). Body: `{ name, unit }`.
 * A name already in the list is a 400, never a duplicate. The new medication's id is the database's and is
 * history's key: it is never deleted or changed.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  try {
    const medication = await addMedication(getServiceClient(), body);
    return NextResponse.json({ medication });
  } catch (e) {
    if (e instanceof InvalidEvent) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}
