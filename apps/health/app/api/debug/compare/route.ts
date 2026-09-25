import { NextRequest, NextResponse } from "next/server";
import { estimateMacros } from "@/lib/anthropic";
import { findItem, resolveVersion, normalizeName, LookupError } from "@/lib/items";
import { macrosOf } from "@/lib/log";
import { judge } from "@/lib/harness";
import type { Macros } from "@/lib/macros";
import { DEFAULT_MODEL, COMPARISON_MODEL, MODELS } from "@/lib/models";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
// Two models, both possibly searching. You wait for the slower one by design.
export const maxDuration = 180;

type Side = { macros: Macros; source_url: string | null; note: string | null } | { error: string };

async function run(name: string, model: typeof DEFAULT_MODEL): Promise<Side> {
  try {
    const e = await estimateMacros({ name, model });
    return { macros: e.macros, source_url: e.source_url, note: e.note };
  } catch (err) {
    // No zeroed macros beside an error: a failed side carries nothing that
    // could be read, compared or picked as a number.
    return { error: err instanceof Error ? err.message : "failed" };
  }
}

/**
 * The debug harness: both models on the same input, and what your table already
 * says.
 *
 * **The calls run in parallel and independently.** Neither model sees the
 * other's output — a shared conversation would contaminate the comparison and
 * it would prove nothing.
 *
 * **Each model is judged against the stored number**, not only against the
 * other (`lib/harness.ts`), and each pair's agreement is stored on the run.
 *
 * **The baseline carries its own provenance, and that is not decoration.** If
 * the stored number was itself produced by Haiku three weeks ago, then "table
 * versus Haiku" is Haiku-then against Haiku-now: run-to-run variance that looks
 * exactly like agreement. A match against a `hand` row is evidence; a match
 * against the same model's earlier guess is not, and the screen has to be able
 * to say which it is looking at.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || !normalizeName(name)) return NextResponse.json({ error: "Name a food to compare." }, { status: 400 });

  // The phone's date, never the server's: the server's day is UTC.
  const onDate = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  if (!onDate) return NextResponse.json({ error: "Send today's date." }, { status: 400 });

  let baseline: { macros: Macros; source: string; model: string | null; item_id: string } | null = null;
  try {
    const remembered = await findItem(name);
    if (remembered) {
      const version = resolveVersion(remembered.versions, onDate);
      if (version) {
        baseline = {
          macros: macrosOf(version),
          source: version.source,
          model: version.model,
          item_id: remembered.item.id,
        };
      }
    }
  } catch (e) {
    // Same rule as everywhere else: a broken lookup is not "this food is new".
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }

  const [haiku, sonnet] = await Promise.all([run(name, DEFAULT_MODEL), run(name, COMPARISON_MODEL)]);
  const verdict = judge(baseline?.macros ?? null, haiku, sonnet);

  // The pick is the label and it is the only ground truth this harness makes,
  // so the run is stored whether or not anything is picked from it. Without
  // that, "is Haiku reliable yet" has no finish line.
  const { data, error } = await getServiceClient()
    .from("comparisons")
    .insert({
      item_name: name,
      baseline: baseline ? baseline.macros : null,
      baseline_source: baseline ? baseline.source : null,
      baseline_model: baseline ? baseline.model : null,
      haiku: "error" in haiku ? { error: haiku.error } : { ...haiku.macros, source_url: haiku.source_url, note: haiku.note },
      sonnet: "error" in sonnet ? { error: sonnet.error } : { ...sonnet.macros, source_url: sonnet.source_url, note: sonnet.note },
      agreed: verdict.agreed,
      haiku_vs_baseline: verdict.haikuVsBaseline,
      sonnet_vs_baseline: verdict.sonnetVsBaseline,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: `Couldn't record that run: ${error.message}` }, { status: 503 });

  return NextResponse.json({
    id: data.id,
    name,
    baseline,
    haiku: { ...haiku, label: MODELS[DEFAULT_MODEL].label, model: DEFAULT_MODEL },
    sonnet: { ...sonnet, label: MODELS[COMPARISON_MODEL].label, model: COMPARISON_MODEL },
    verdict,
  });
}
