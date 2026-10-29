import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { listDogs, listFoods, listPeople, readJournal } from "@/lib/journal";
import { eventPhotos, liveEvents } from "@/lib/events";
import { signedPhotoUrls } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * The screen's one read. `since` is the phone's local midnight, so "today" is
 * the phone's day, never the server's. A failure is a 503 and the screen keeps
 * saying so; it never shows an empty day.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("since");
  const since = raw ? new Date(raw) : null;
  if (!since || Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "since must be a time" }, { status: 400 });
  }
  try {
    const db = getServiceClient();
    const [events, people, dogs, foods] = await Promise.all([readJournal(db, since), listPeople(db), listDogs(db), listFoods(db)]);
    // Signed URLs for the live entries' photos (Health, Potty, Fun, Training), by
    // path. A path that could not be signed is absent and the screen says so
    // on that photo.
    const paths = liveEvents(events).flatMap((e) => eventPhotos(e));
    // Storage being down must not take the whole journal with it.
    const photos = Object.fromEntries(await signedPhotoUrls(db, [...new Set(paths)]).catch(() => new Map<string, string>()));
    return NextResponse.json({ events, people, dogs, foods, photos });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}
