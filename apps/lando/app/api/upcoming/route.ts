import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { InvalidEvent } from "@/lib/events";
import { Conflict } from "@/lib/journal";
import { parseAction } from "@/lib/upcoming";
import { applyAction, listOpen } from "@/lib/upcoming-db";
import { signedPhotoUrls } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * The open items, soonest first, and a signed URL for each of their attachments by path (TEC-203; a path that
 * could not be signed is absent). A failure is a 503, never an empty list.
 */
export async function GET() {
  try {
    const db = getServiceClient();
    const items = await listOpen(db);
    const paths = [...new Set(items.flatMap((i) => i.attachments?.photos ?? []))];
    const photos = Object.fromEntries(await signedPhotoUrls(db, paths).catch(() => new Map<string, string>()));
    return NextResponse.json({ items, photos });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}

/**
 * Add, edit, cancel or mark done (TEC-192). Body: `{ action: "add", item }`, `{ action: "edit", id, item }`,
 * `{ action: "cancel", id }` or `{ action: "done", id, done_on, done_event? }`. Items are plans: edited in
 * place, cancelled and never deleted. A vet visit or vaccine is done only with the id of a saved visit.
 * A done repeating item answers with its next one.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  try {
    const result = await applyAction(getServiceClient(), parseAction(body));
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof InvalidEvent) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof Conflict) return NextResponse.json({ error: e.message }, { status: 409 });
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}
