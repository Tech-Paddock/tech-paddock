import { NextRequest, NextResponse } from "next/server";
import { upsertItem, versionsOf, addVersion, eraFor, LookupError } from "@/lib/items";
import { parseMacros } from "@/lib/macros";
import { DEFAULT_MODEL, COMPARISON_MODEL } from "@/lib/models";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MODEL_FOR = { haiku: DEFAULT_MODEL, sonnet: COMPARISON_MODEL } as const;

/**
 * Promote a comparison's winner onto the food's own record.
 *
 * **A pick is allowed to win** — otherwise you are staring at a disagreement
 * you cannot resolve. What it is not allowed to do is erase what it replaced:
 * this appends a version like every other write, so the hand-entered figure it
 * beat is still there and still reconstructible.
 *
 * **The client sends only the run and the choice.** The numbers, the page and
 * the model are read from the stored `comparisons` row, so what lands on the
 * food is what the run actually produced — not whatever a request body says it
 * produced.
 *
 * **A pick is one-shot.** It is claimed on the row first (`picked is null`), so
 * a second tap or a replayed request is a 409 rather than a second version.
 * The time it was made is stored with it, because the plan's validation stat is
 * a count of picks and a pick without a time is not one you can audit.
 *
 * It is written as a `correction` because that is what a pick asserts — the
 * stored number was wrong — and it moves no day already logged; logged lines
 * carry their own snapshot.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const comparisonId = typeof body.comparison_id === "string" ? body.comparison_id : "";
  const picked: unknown = body.picked;
  // The phone's date, for which era a correction belongs to. Never UTC.
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;

  if (!comparisonId) return NextResponse.json({ error: "Which run?" }, { status: 400 });
  if (picked !== "haiku" && picked !== "sonnet" && picked !== "baseline") {
    return NextResponse.json({ error: "Pick haiku, sonnet or baseline." }, { status: 400 });
  }
  if (!date) return NextResponse.json({ error: "Send today's date." }, { status: 400 });

  const supabase = getServiceClient();

  try {
    const { data: row, error: readError } = await supabase
      .from("comparisons")
      .select("id, item_name, baseline, haiku, sonnet, picked")
      .eq("id", comparisonId)
      .maybeSingle();
    if (readError) throw new LookupError(`Couldn't read that run: ${readError.message}`);
    if (!row) return NextResponse.json({ error: "No such run." }, { status: 404 });
    if (row.picked) return NextResponse.json({ error: "This run has already been picked from." }, { status: 409 });

    // What would be written, read from the run itself and checked before the
    // pick is claimed.
    const side = picked === "baseline" ? null : (row[picked] as Record<string, unknown> | null);
    if (picked === "baseline" && !row.baseline) {
      return NextResponse.json({ error: "There was no stored figure to keep." }, { status: 400 });
    }
    const macros = side ? parseMacros(side) : null;
    if (side && !macros) {
      return NextResponse.json({ error: `${picked === "haiku" ? "Haiku" : "Sonnet"} failed on this run; there is nothing to keep.` }, { status: 400 });
    }

    // Claim it. Only one request can move `picked` off null.
    const { data: claimed, error: claimError } = await supabase
      .from("comparisons")
      .update({ picked, picked_at: new Date().toISOString() })
      .eq("id", comparisonId)
      .is("picked", null)
      .select("id");
    if (claimError) throw new LookupError(`Couldn't record that pick: ${claimError.message}`);
    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ error: "This run has already been picked from." }, { status: 409 });
    }

    // Picking the baseline changes nothing about the food — it is a vote, and
    // the vote is the data.
    if (picked === "baseline" || !macros || !side) return NextResponse.json({ picked, applied: false });

    try {
      const item = await upsertItem(row.item_name as string);
      const existing = await versionsOf(item.id);
      // The URL on the stored run was already checked against the pages that
      // run read (`lib/webEvidence.ts`), so its presence is what "web" means.
      const url = typeof side.source_url === "string" && side.source_url ? side.source_url : null;

      const version = await addVersion({
        itemId: item.id,
        macros,
        kind: "correction",
        effectiveFrom: eraFor(existing, date),
        source: url ? "web" : "estimate",
        model: MODEL_FOR[picked],
        sourceUrl: url,
        note: `Picked over the stored figure in debug run ${comparisonId}.`,
      });

      const { error } = await supabase
        .from("comparisons")
        .update({ applied_version_id: version.id })
        .eq("id", comparisonId);
      if (error) throw new LookupError(`Recorded the number but not which version it made: ${error.message}`);

      return NextResponse.json({ picked, applied: true, version });
    } catch (e) {
      // The number never landed, so release the claim rather than leave a pick
      // recorded against a food that did not change.
      await supabase
        .from("comparisons")
        .update({ picked: null, picked_at: null })
        .eq("id", comparisonId)
        .is("applied_version_id", null);
      throw e;
    }
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't apply that pick." },
      { status: 500 }
    );
  }
}
