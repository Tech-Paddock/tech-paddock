import { NextRequest, NextResponse } from "next/server";
import { searchBrewGuide } from "@/lib/anthropic";
import { isSearchModel, isEffortFor, effortsFor, DEFAULT_SEARCH_MODEL } from "@/lib/models";
import { findRoasterDomain, guideColumns } from "@/lib/bags";
import { getServiceClient } from "@/lib/supabase";
import { suggestOnBag } from "@/lib/suggestOnBag";
import type { Suggestion } from "@/lib/suggestion";

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

  // Refused rather than dropped. Silently ignoring an effort level this model
  // cannot take would report a comparison that never ran at that setting.
  if (body.effort != null && !isEffortFor(model, body.effort)) {
    const offered = effortsFor(model);
    return NextResponse.json(
      {
        error: offered.length
          ? `${model} takes effort ${offered.join(", ")} — not "${body.effort}".`
          : `${model} has no effort control, so "${body.effort}" can't be set for it.`,
      },
      { status: 400 }
    );
  }
  const effort = isEffortFor(model, body.effort) ? body.effort : null;

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

    const guide = await searchBrewGuide({ roaster, coffeeName, roasterDomain, model, effort });

    // The result lands in the row, not in this response. That is the whole
    // point: by now the page that asked for it may be long gone.
    let suggestion: Suggestion | null = null;
    if (bagId) {
      const { data: bag, error } = await supabase
        .from("bags")
        .update({ ...guideColumns(guide, model, effort), guide_search_started_at: null })
        .eq("id", bagId)
        .select("roaster, coffee_name, origin, process, varietal, roast_date")
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Nothing published anywhere on the roaster's own site is a correct and
      // recorded answer, and since 2026-09-19 it is no longer the end of it:
      // Claude suggests a starting point of its own, into its own column.
      // `none` only — a tier-2 house guide is a recipe that was found, and
      // suggesting over it would bury the thing this app exists to retrieve.
      //
      // It runs here rather than on the page for the same reason the search
      // does: the answer belongs on the row, where closing the tab cannot
      // lose it. It costs seconds against a search that took minutes, and it
      // cannot fail the search — suggestOnBag records its own failure.
      if (guide.status === "none" && bag) {
        suggestion = (await suggestOnBag(bagId, bag)).suggestion;
      }
    }

    return NextResponse.json({ guide, model, effort, suggestion });
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
