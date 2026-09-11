import { NextRequest, NextResponse } from "next/server";
import { loadDashboard } from "@/lib/dashboard";
import { getServiceClient } from "@/lib/supabase";
import { decayThresholdFor } from "@/lib/signals";

export const dynamic = "force-dynamic";

/**
 * Threads with their derived last touch attached.
 *
 * The list used to sort on `last_touch_date` alone, which meant it could say a
 * thread was two weeks cold on the same day you emailed them. It now shares the
 * dashboard's derivation, so the two views cannot disagree about what is stale.
 */
export async function GET() {
  try {
    const data = await loadDashboard();
    return NextResponse.json({
      threads: data.threads.map((thread) => {
        const touch = data.touches.get(thread.id);
        return {
          ...thread,
          effective_touch: touch ?? null,
          decay_threshold: decayThresholdFor(thread.stage),
        };
      }),
      degraded: data.degraded,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("pipeline_threads")
    .insert({
      contact_id: body.contact_id ?? null,
      company: body.company,
      stage: body.stage ?? "Applied",
      last_touch_date: body.last_touch_date ?? new Date().toISOString().slice(0, 10),
      next_action: body.next_action ?? null,
      notes: body.notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ thread: data }, { status: 201 });
}
