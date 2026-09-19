import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { suggestOnBag } from "@/lib/suggestOnBag";

export const dynamic = "force-dynamic";
// One model call with no web tools, so nothing like the search's five minutes
// — but it is still a model call at the end of a mobile connection.
export const maxDuration = 120;

/**
 * Suggest a recipe for a bag whose roaster published none, on demand.
 *
 * The search does this by itself when it comes back with nothing. This route
 * exists for the bags that were already in the library before it did, and for
 * asking again when a suggestion failed — without it the feature would be
 * invisible until the next bag was scanned.
 *
 * **It refuses a bag that has a guide.** Not because generating one would be
 * expensive, but because the roaster's recipe is the answer to the question
 * this app asks, and offering to generate over it is how the two start
 * competing for the same space on the card.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getServiceClient();

  const { data: bag, error } = await supabase
    .from("bags")
    .select("id, roaster, coffee_name, origin, process, varietal, roast_date, guide_status")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!bag) return NextResponse.json({ error: "No such bag." }, { status: 404 });

  if (bag.guide_status !== "none") {
    return NextResponse.json(
      {
        error:
          bag.guide_status === "not_searched"
            ? "This bag hasn't been searched yet — look for the roaster's own instructions first."
            : "This bag already has the roaster's instructions on it.",
      },
      { status: 409 }
    );
  }

  const { suggestion, error: failure } = await suggestOnBag(bag.id, bag);
  // The row already records this failure. Reporting it as a 502 as well is
  // what stops the page rendering an empty card as though Claude had shrugged.
  if (failure) return NextResponse.json({ error: failure }, { status: 502 });

  return NextResponse.json({ suggestion });
}
