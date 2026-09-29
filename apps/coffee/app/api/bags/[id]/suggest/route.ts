import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { suggestOnBag } from "@/lib/suggestOnBag";

export const dynamic = "force-dynamic";
// One model call with no web tools, so nothing like the search's five minutes
// — but it is still a model call at the end of a mobile connection.
export const maxDuration = 120;

/**
 * Suggest a recipe for a bag, on demand — any bag, whatever its search found.
 *
 * The search does this by itself when it comes back with nothing. This route
 * is the **Suggest a recipe** button in the bag's Claude section, which is on
 * every bag beside the roaster's section (Joel, 2026-09-29), so it no longer
 * refuses a bag that has a guide. The two stay apart by column —
 * `suggested_recipe`, never `guide_*` — and by section on the card, not by
 * one being withheld.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getServiceClient();

  const { data: bag, error } = await supabase
    .from("bags")
    .select("id, roaster, coffee_name, origin, process, varietal, roast_date")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!bag) return NextResponse.json({ error: "No such bag." }, { status: 404 });

  const { suggestion, error: failure } = await suggestOnBag(bag.id, bag);
  // The row already records this failure. Reporting it as a 502 as well is
  // what stops the page rendering an empty card as though Claude had shrugged.
  if (failure) return NextResponse.json({ error: failure }, { status: 502 });

  return NextResponse.json({ suggestion });
}
