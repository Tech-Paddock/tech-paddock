import { NextRequest, NextResponse } from "next/server";
import { searchBrewGuide } from "@/lib/anthropic";
import { isSearchModel, isEffortFor, effortsFor, DEFAULT_SEARCH_MODEL } from "@/lib/models";
import { guideColumns, hostOf } from "@/lib/bags";
import { getServiceClient } from "@/lib/supabase";
import { suggestOnBag } from "@/lib/suggestOnBag";
import type { Suggestion } from "@/lib/suggestion";
import { SEARCH_STALE_MS } from "@/lib/searchClock";

export const dynamic = "force-dynamic";
// Three tiers of search and fetch runs well past the default. The page no
// longer waits on this response, but the function still has to be allowed to
// finish — the answer is written to the row at the end of it.
//
// A literal, because Next reads segment config statically. It must equal
// `SEARCH_STALE_MS` in `lib/searchClock.ts`, and the search stops itself at
// `SEARCH_BUDGET_MS`, thirty seconds inside it, so that this function always
// lives long enough to write down why it stopped.
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
  // "still working" from "never started" — and read the product page off the
  // row in the same round trip.
  //
  // **Off the row, never off the request.** Joel, 2026-09-22: *"Research
  // should just kick off the original search not be a unique process.
  // Research is a trigger."* A caller that could hand in a product URL is a
  // caller that can make its search different from the scan screen's, which is
  // exactly the divergence that wording rules out. What the search does now
  // depends on what the bag knows, not on which button started it — a fresh
  // bag has no product URL because nothing has found one yet, and a bag that
  // has been searched before does.
  //
  // **One search per bag at a time.** The stamp is only taken when no live
  // search holds it — none at all, or one old enough that nothing can still
  // be working under it (`lib/searchClock.ts`). The page already refuses to
  // start a second one; this is the same rule where it cannot be skipped.
  let productUrl: string | null = null;
  let stamp: string | null = null;
  if (bagId) {
    const staleBefore = new Date(Date.now() - SEARCH_STALE_MS).toISOString();
    const { data: row, error } = await supabase
      .from("bags")
      .update({ guide_search_started_at: new Date().toISOString(), guide_search_error: null })
      .eq("id", bagId)
      .or(`guide_search_started_at.is.null,guide_search_started_at.lt.${staleBefore}`)
      .select("product_url, guide_search_started_at")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!row) {
      const { data: exists } = await supabase.from("bags").select("id").eq("id", bagId).maybeSingle();
      return exists
        ? NextResponse.json({ error: "A search is already running on this bag." }, { status: 409 })
        : NextResponse.json({ error: "No such bag." }, { status: 404 });
    }
    // The stamp as the database stored it, which is how this run recognises
    // its own claim on the row when it fails (below).
    stamp = row.guide_search_started_at as string;
    // `hostOf` is a sanity check, not a constraint: a stored value that is not
    // a web URL at all is dropped rather than handed over as though it were a page.
    productUrl = hostOf(row.product_url) ? (row.product_url as string).trim() : null;
  }

  const began = Date.now();

  try {
    const { guide, warning } = await searchBrewGuide({ roaster, coffeeName, productUrl, model, effort });

    // The result lands in the row, not in this response. That is the whole
    // point: by now the page that asked for it may be long gone.
    //
    // Written whatever else happened meanwhile — Joel, 2026-09-24: searching
    // again keeps only the freshest result, even when it finds less. A `none`
    // recorded despite a tool failure carries that failure as its warning in
    // `guide_search_error`, beside the answer rather than instead of it; a
    // clean run clears whatever an earlier run left there.
    let suggestion: Suggestion | null = null;
    if (bagId) {
      const { data: bag, error } = await supabase
        .from("bags")
        .update({ ...guideColumns(guide, model, effort), guide_search_started_at: null, guide_search_error: warning })
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
      // lose it. It cannot fail the search — suggestOnBag records its own
      // failure — and it gets only what is left of the function's time, so a
      // search that used most of it produces a recorded timeout rather than a
      // function killed mid-write.
      if (guide.status === "none" && bag) {
        const left = SEARCH_STALE_MS - 5_000 - (Date.now() - began);
        suggestion = (await suggestOnBag(bagId, bag, AbortSignal.timeout(Math.max(left, 1_000)))).suggestion;
      }
    }

    return NextResponse.json({ guide, warning, model, effort, suggestion });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The search failed.";
    // A failure is recorded too. Otherwise a bag sits on "searching" forever
    // and nothing anywhere says why.
    //
    // **Only onto this run's own claim.** If another run has since finished
    // (clearing the stamp) or started (replacing it), this failure is not the
    // row's news: writing it would put an error beside a recipe another run
    // just saved.
    if (bagId && stamp) {
      await supabase
        .from("bags")
        .update({ guide_search_started_at: null, guide_search_error: message })
        .eq("id", bagId)
        .eq("guide_search_started_at", stamp);
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
