import { NextRequest, NextResponse } from "next/server";
import { LookupError } from "@/lib/items";
import { parseTargetInput } from "@/lib/targets";
import { readTargetFor, saveTarget } from "@/lib/targetStore";

export const dynamic = "force-dynamic";

/**
 * The daily macro target (TEC-53). Database only — no model, ever.
 *
 * GET answers three different things and keeps them apart: a target
 * (`{ target }`), no target yet (`{ target: null }`), and a read that failed
 * (a 503). **The last is never the second** — a budget that could not be read
 * must not look like one that was never set.
 */
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Ask for a date as YYYY-MM-DD." }, { status: 400 });
  }
  try {
    return NextResponse.json({ target: await readTargetFor(date) });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't read your target." },
      { status: 500 },
    );
  }
}

/**
 * Set a new target, from today (Joel, 2026-09-29: no backdating). Appends a
 * row; the days before keep the target they had.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const input = parseTargetInput(body, new Date());
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

  try {
    return NextResponse.json({ target: await saveTarget(input) }, { status: 201 });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't save that target." },
      { status: 500 },
    );
  }
}
