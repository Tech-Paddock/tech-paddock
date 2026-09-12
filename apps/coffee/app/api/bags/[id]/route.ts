import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { signedPhotoUrl, deletePhoto } from "@/lib/storage";

export const dynamic = "force-dynamic";

// Only the my_* fields are editable. The guide_* values and their quotes are
// a record of what the roaster published at a point in time — editing them
// would make the stored quotes stop matching the stored numbers, which is
// exactly the thing the quotes exist to prevent. Re-run the search to change
// them.
// The dial-in moved to coffee.brews, so what remains editable on a bag is
// what belongs to the purchase rather than to any one attempt at brewing it.
const EDITABLE = ["my_notes", "purchased_date"] as const;

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await getServiceClient().from("bags").select("*").eq("id", params.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "No such bag." }, { status: 404 });

  return NextResponse.json({
    bag: { ...data, photo_url: data.photo_path ? await signedPhotoUrl(data.photo_path) : null },
  });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Send a JSON object." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    if (!(key in body)) continue;
    const value = body[key];

    if (value === null || value === "") {
      update[key] = null;
      continue;
    }

    if (key === "purchased_date" && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      return NextResponse.json({ error: "Purchased date must be YYYY-MM-DD." }, { status: 400 });
    }

    update[key] = String(value);
  }

  const rejected = Object.keys(body).filter((k) => !(EDITABLE as readonly string[]).includes(k));
  if (rejected.length) {
    return NextResponse.json(
      { error: `Not editable: ${rejected.join(", ")}. Re-run the search to change what the roaster published.` },
      { status: 400 }
    );
  }
  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  update.updated_at = new Date().toISOString();

  const { data, error } = await getServiceClient()
    .from("bags")
    .update(update)
    .eq("id", params.id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "No such bag." }, { status: 404 });
  return NextResponse.json({ bag: data });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  // Take the row away first and the photo after it. The save path writes the
  // file before the row that points at it, so a row never references an object
  // that was never created; deleting in the same order keeps that true. A
  // leftover object is a smaller problem than a row with a broken photo.
  const { data, error } = await getServiceClient()
    .from("bags")
    .delete()
    .eq("id", params.id)
    .select("id, photo_path")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Deleting nothing is not success. Without this a wrong id reports "deleted".
  if (!data) return NextResponse.json({ error: "No such bag." }, { status: 404 });

  if (data.photo_path) await deletePhoto(data.photo_path);

  return NextResponse.json({ ok: true });
}
