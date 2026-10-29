import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { addFood } from "@/lib/journal";
import { InvalidEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

/**
 * Add a food to the meal or treat list (the Food form's "Add a food…", TEC-191). Body:
 * `{ type, name, unit, kcalPer? }`. A name already in that list is a 400, never a duplicate.
 * The new food's id is the database's and is history's key: it is never deleted or changed.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  try {
    const food = await addFood(getServiceClient(), body);
    return NextResponse.json({ food });
  } catch (e) {
    if (e instanceof InvalidEvent) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}
