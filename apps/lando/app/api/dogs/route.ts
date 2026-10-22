import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { addDog } from "@/lib/journal";
import { InvalidEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

/**
 * Add a friend's dog (Other dogs' "Add dog…"). A name already there in another
 * case is returned, not duplicated. Names live in the database, never in the repo.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
  try {
    const dog = await addDog(getServiceClient(), body?.name);
    return NextResponse.json({ dog });
  } catch (e) {
    if (e instanceof InvalidEvent) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}
