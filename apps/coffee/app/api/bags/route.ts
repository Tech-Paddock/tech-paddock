import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { uploadPhoto, signedPhotoUrl, StorageError, IMAGE_TYPES } from "@/lib/storage";
import { isBrewMethod } from "@/lib/methods";
import { findPreviousBag } from "@/lib/bags";
import type { Guide } from "@/lib/guide";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // Asking about one specific coffee is a different question from searching
  // the library: it's "have I bought this before, and what did I land on".
  const roaster = params.get("roaster")?.trim();
  const coffeeName = params.get("coffee_name")?.trim();
  if (roaster && coffeeName) {
    return NextResponse.json({ previous: await findPreviousBag(roaster, coffeeName) });
  }

  const q = params.get("q")?.trim();
  const supabase = getServiceClient();

  let query = supabase.from("bags").select("*").order("created_at", { ascending: false });
  if (q) {
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    query = query.or(
      ["roaster", "coffee_name", "origin", "process", "varietal", "my_notes"]
        .map((c) => `${c}.ilike.${like}`)
        .join(",")
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Photos live in a private bucket, so the list carries short-lived signed
  // URLs rather than paths the browser can't resolve.
  const bags = await Promise.all(
    (data ?? []).map(async (bag) => ({
      ...bag,
      photo_url: bag.photo_path ? await signedPhotoUrl(bag.photo_path) : null,
    }))
  );

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

  let guide: Guide | null = null;
  const guideRaw = field("guide");
  if (guideRaw) {
    try {
      guide = JSON.parse(guideRaw) as Guide;
    } catch {
      return NextResponse.json({ error: "The guide payload wasn't valid JSON." }, { status: 400 });
    }
  }

  const myMethod = field("my_method");
  if (myMethod && !isBrewMethod(myMethod)) {
    return NextResponse.json({ error: `"${myMethod}" isn't one of the brew methods.` }, { status: 400 });
  }

  const rating = field("my_rating");
  const ratingValue = rating ? Number(rating) : null;
  if (ratingValue !== null && (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5)) {
    return NextResponse.json({ error: "Rating must be a whole number from 1 to 5." }, { status: 400 });
  }

  try {
    // The file is written before the row that points at it, so a row never
    // references an object that was never created.
    let photoPath: string | null = null;
    const photo = form.get("photo");
    if (photo instanceof File && photo.size > 0) {
      if (!IMAGE_TYPES.includes(photo.type)) {
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
        roast_date: field("roast_date"),
        photo_path: photoPath,
        product_url: guide?.product_url ?? null,
        guide_url: guide?.guide_url ?? null,
        guide_status: guide?.status ?? "not_searched",
        guide_method: guide?.method ?? null,
        guide_ratio: guide?.params.ratio ?? null,
        guide_dose: guide?.params.dose ?? null,
        guide_water: guide?.params.water ?? null,
        guide_temp: guide?.params.temp ?? null,
        guide_grind: guide?.params.grind ?? null,
        guide_time: guide?.params.time ?? null,
        guide_quotes: guide?.quotes ?? [],
        guide_fetched_at: guide && guide.status !== "not_searched" ? new Date().toISOString() : null,
        // Picking a method pre-populates the bag's; when a guide was found its
        // method is the roaster's recommendation and seeds this.
        my_method: myMethod ?? guide?.method ?? null,
        my_grinder: field("my_grinder"),
        my_grind_setting: field("my_grind_setting"),
        my_notes: field("my_notes"),
        my_rating: ratingValue,
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
