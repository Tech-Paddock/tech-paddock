import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { InvalidEvent } from "@/lib/events";
import { PhotoConflict, photoPath, signedPhotoUrls, uploadPhoto, type PhotoType } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * One health photo, already downscaled on the phone: multipart `id` (the
 * phone's UUID for it) and `file`. Answers its storage path and a signed URL.
 * Behind the gate like every route. A failure is a status the form shows on
 * that photo with a Retry; the entry cannot be saved around it. A path that
 * already holds a different photo is a 409: a stored photo never changes.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return NextResponse.json({ error: "expected a photo" }, { status: 400 });
  try {
    const path = photoPath(form.get("id"), file.type, file.size);
    const db = getServiceClient();
    await uploadPhoto(db, path, await file.arrayBuffer(), file.type as PhotoType);
    const url = (await signedPhotoUrls(db, [path])).get(path);
    if (!url) throw new Error("the photo was stored but could not be read back");
    return NextResponse.json({ path, url });
  } catch (e) {
    if (e instanceof PhotoConflict) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof InvalidEvent) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}
