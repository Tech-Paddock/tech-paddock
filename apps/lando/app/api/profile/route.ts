import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { InvalidEvent } from "@/lib/events";
import { parseProfile } from "@/lib/profile";
import { readProfile, readProfileHistory, saveProfile } from "@/lib/profile-db";

export const dynamic = "force-dynamic";

/**
 * Lando's Profile (TEC-260). GET: the stored details and the all-time vaccine and vet history the Profile reads (the
 * journal's own read keeps only 30 days of them). POST: saves the details, checked first. Behind the gate like every
 * route. The details include the microchip and policy numbers, so nothing here logs a request, a body or a row.
 */
export async function GET() {
  try {
    const db = getServiceClient();
    const [profile, history] = await Promise.all([readProfile(db), readProfileHistory(db)]);
    return NextResponse.json({ profile, history });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  try {
    const profile = await saveProfile(getServiceClient(), parseProfile(body));
    return NextResponse.json({ profile });
  } catch (e) {
    if (e instanceof InvalidEvent) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}
