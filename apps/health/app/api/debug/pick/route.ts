import { NextRequest, NextResponse } from "next/server";
import { upsertItem, versionsOf, addVersion, eraFor, LookupError } from "@/lib/items";
import { parseMacros } from "@/lib/macros";
import { isModelId } from "@/lib/models";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Promote a comparison's winner onto the food's own record.
 *
 * **A pick is allowed to win** — otherwise you are staring at a disagreement
 * you cannot resolve. What it is not allowed to do is erase what it replaced:
 * this appends a version like every other write, so the hand-entered figure it
 * beat is still there and still reconstructible. That is the difference between
 * this and the plan's original wording, and it is the whole of issue #116's
 * first finding.
 *
 * It is written as a `correction` because that is what a pick asserts — the
 * stored number was wrong — and the run that moved it is recorded on the
 * comparison row, so a figure that changed can be traced back to the run that
 * changed it.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const comparisonId = typeof body.comparison_id === "string" ? body.comparison_id : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const picked = body.picked;
  const macros = parseMacros(body.macros);

  if (!comparisonId) return NextResponse.json({ error: "Which run?" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Which food?" }, { status: 400 });
  if (!macros) return NextResponse.json({ error: "Those numbers are not usable." }, { status: 400 });
  if (picked !== "haiku" && picked !== "sonnet" && picked !== "baseline") {
    return NextResponse.json({ error: "Pick haiku, sonnet or baseline." }, { status: 400 });
  }

  const supabase = getServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  try {
    // Picking the baseline changes nothing about the food — it is a vote, and
    // the vote is the data. Recording it without writing a version is correct.
    if (picked === "baseline") {
      const { error } = await supabase.from("comparisons").update({ picked }).eq("id", comparisonId);
      if (error) throw new LookupError(`Couldn't record that pick: ${error.message}`);
      return NextResponse.json({ picked, applied: false });
    }

    const model = typeof body.model === "string" && isModelId(body.model) ? body.model : null;
    if (!model) return NextResponse.json({ error: "A model-produced number must say which model." }, { status: 400 });

    const item = await upsertItem(name);
    const existing = await versionsOf(item.id);

    const version = await addVersion({
      itemId: item.id,
      macros,
      kind: "correction",
      effectiveFrom: eraFor(existing, today),
      source: typeof body.source_url === "string" && body.source_url.startsWith("http") ? "web" : "estimate",
      model,
      sourceUrl: typeof body.source_url === "string" ? body.source_url : null,
      note: `Picked over the stored figure in debug run ${comparisonId}.`,
    });

    const { error } = await supabase
      .from("comparisons")
      .update({ picked, applied_version_id: version.id })
      .eq("id", comparisonId);
    if (error) throw new LookupError(`Recorded the number but not the pick: ${error.message}`);

    return NextResponse.json({ picked, applied: true, version });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't apply that pick." },
      { status: 500 }
    );
  }
}
