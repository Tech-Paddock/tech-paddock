import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { uploadPhoto, signedPhotoUrls, StorageError, isImageType } from "@/lib/storage";
import { findPreviousBag, guideColumns, searchPattern } from "@/lib/bags";
import { isIsoDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // Asking about one specific coffee is a different question from searching
  // the library: it's "have I bought this before, and what did I land on".
  const roaster = params.get("roaster")?.trim();
  const coffeeName = params.get("coffee_name")?.trim();
  if (roaster && coffeeName) {
    // Report a lookup that could not run as a failure rather than as "no
    // previous purchase" — they are the same null, and only one is an answer.
    try {
      const exclude = params.get("exclude")?.trim() || null;
      return NextResponse.json({ previous: await findPreviousBag(roaster, coffeeName, exclude) });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "The previous-purchase lookup failed." },
        { status: 500 }
      );
    }
  }

  const q = params.get("q")?.trim();
  const supabase = getServiceClient();

  let query = supabase.from("bags").select("*").order("created_at", { ascending: false });

  if (q) {
    const like = searchPattern(q);
    query = query.or(
      ["roaster", "coffee_name", "origin", "process", "varietal", "my_notes"]
        .map((c) => `${c}.ilike.${like}`)
        .join(",")
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Photos live in a private bucket, so the list carries short-lived signed
  // URLs rather than paths the browser can't resolve — signed in one batch,
  // rather than one storage round trip per bag on every load.
  const rows = data ?? [];
  const urls = await signedPhotoUrls(rows.map((bag) => bag.photo_path).filter((p): p is string => !!p));
  const bags = rows.map((bag) => ({
    ...bag,
    photo_url: bag.photo_path ? (urls.get(bag.photo_path) ?? null) : null,
  }));

  return NextResponse.json({ bags });
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send the bag as multipart form data." }, { status: 400 });
  }

  const field = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const roaster = field("roaster");
  const coffeeName = field("coffee_name");
  if (!roaster || !coffeeName) {
    return NextResponse.json({ error: "A roaster and a coffee name are required." }, { status: 400 });
  }

  // **No guide is accepted here, and nothing here writes one.** This route
  // took a client-supplied `guide`, `guide_model` and `guide_effort` until
  // 2026-09-25 and wrote them straight into the `guide_*` columns without
  // `validateGuide` — a path around the rule this app exists for (RULES §1),
  // and a bare 500 on a guide with no `params`. The page never sent them: a
  // bag is saved first and the search writes its guide, so the only guide
  // this route can know about is none at all. Anything sent under those
  // names is ignored like any other unknown field.

  // Both dates are checked here, not just the one the form used to send.
  // roast_date is read off a label by a vision model and went straight into a
  // Postgres `date` column unvalidated: "Roasted 08.14.26" then failed the
  // insert, and what the page showed for it was "Couldn't save that bag" on a
  // bag that had scanned perfectly. The page now sends a real date or nothing
  // — lib/dates.ts is where a label's wording becomes one — so anything else
  // arriving here is a caller's mistake and says which field it was.
  const dates: Record<string, string | null> = {};
  for (const key of ["purchased_date", "roast_date"]) {
    const value = field(key);
    if (value && !isIsoDate(value)) {
      return NextResponse.json({ error: `${key.replace("_", " ")} must be YYYY-MM-DD.` }, { status: 400 });
    }
    dates[key] = value;
  }

  try {
    // The file is written before the row that points at it, so a row never
    // references an object that was never created.
    let photoPath: string | null = null;
    const photo = form.get("photo");
    if (photo instanceof File && photo.size > 0) {
      if (!isImageType(photo.type)) {
        return NextResponse.json({ error: "That photo isn't a supported image type." }, { status: 415 });
      }
      if (photo.size > MAX_BYTES) {
        return NextResponse.json({ error: "That photo is too large." }, { status: 413 });
      }
      photoPath = await uploadPhoto(photo.name || "bag.jpg", Buffer.from(await photo.arrayBuffer()), photo.type);
    }

    const { data, error } = await getServiceClient()
      .from("bags")
      .insert({
        roaster,
        coffee_name: coffeeName,
        origin: field("origin"),
        process: field("process"),
        varietal: field("varietal"),
        roast_date: dates.roast_date,
        photo_path: photoPath,
        // Every guide column at its "not searched yet" value, from the one
        // mapping that knows them all.
        ...guideColumns(null),
        purchased_date: dates.purchased_date,
        my_notes: field("my_notes"),
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ bag: data }, { status: 201 });
  } catch (error) {
    if (error instanceof StorageError) return NextResponse.json({ error: error.message }, { status: 502 });
    throw error;
  }
}
