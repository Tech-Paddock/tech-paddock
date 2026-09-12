import { NextRequest, NextResponse } from "next/server";
import { searchBrewGuide } from "@/lib/anthropic";
import { isSearchModel, DEFAULT_SEARCH_MODEL } from "@/lib/models";
import { findRoasterDomain, guideColumns } from "@/lib/bags";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
// Three tiers of search and fetch runs well past the default. The page no
// longer waits on this response, but the function still has to be allowed to
// finish — the answer is written to the row at the end of it.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const roaster = typeof body.roaster === "string" ? body.roaster.trim() : "";
  const coffeeName = typeof body.coffee_name === "string" ? body.coffee_name.trim() : "";
  const bagId = typeof body.bag_id === "string" && body.bag_id.trim() ? body.bag_id.trim() : null;

  if (!roaster || !coffeeName) {
    return NextResponse.json({ error: "A roaster and a coffee name are needed to search." }, { status: 400 });
  }

  // An unknown model is refused rather than quietly swapped: silently running
  // a different model than the one under test is worse than not running.
  if (body.model !== undefined && !isSearchModel(body.model)) {
    return NextResponse.json({ error: `"${body.model}" isn't a search model.` }, { status: 400 });
  }
  const model = isSearchModel(body.model) ? body.model : DEFAULT_SEARCH_MODEL;

  const supabase = getServiceClient();

  // Mark it in flight before the long call, so a page that reconnects can tell
  // "still working" from "never started".
  if (bagId) {
    await supabase
      .from("bags")
      .update({ guide_search_started_at: new Date().toISOString(), guide_search_error: null })
      .eq("id", bagId);
  }

  try {
    // Prefer a domain a previous search already verified for this roaster over
    // one the caller supplied, and fall back to neither rather than a guess.
    const roasterDomain =
      (await findRoasterDomain(roaster)) ??
      (typeof body.roaster_domain === "string" && body.roaster_domain.trim() ? body.roaster_domain.trim() : null);

    const guide = await searchBrewGuide({ roaster, coffeeName, roasterDomain, model });

    // The result lands in the row, not in this response. That is the whole
    // point: by now the page that asked for it may be long gone.
    if (bagId) {
      const { error } = await supabase
        .from("bags")
        .update({ ...guideColumns(guide, model), guide_search_started_at: null })
        .eq("id", bagId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ guide, model });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The search failed.";
    // A failure is recorded too. Otherwise a bag sits on "searching" forever
    // and nothing anywhere says why.
    if (bagId) {
      await supabase
        .from("bags")
        .update({ guide_search_started_at: null, guide_search_error: message })
        .eq("id", bagId);
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
