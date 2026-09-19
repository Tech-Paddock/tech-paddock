import { NextRequest, NextResponse } from "next/server";
import { parseDictation } from "@/lib/anthropic";
import { resolveItem, type Draft } from "@/lib/log";
import { LookupError } from "@/lib/items";
import { isMeal } from "@/lib/meals";

export const dynamic = "force-dynamic";
// The estimate may search and read pages, and the page waits on this response
// because you are standing there with your thumb over Approve.
export const maxDuration = 120;

/**
 * Dictation in, draft out. **This route writes nothing** — guardrail 1: the
 * draft is not the log, and approving is the only thing that writes.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Say what you ate first." }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "That is longer than one meal. Log it in parts." }, { status: 413 });
  }

  const hour = Number.isInteger(body.hour) && body.hour >= 0 && body.hour <= 23 ? body.hour : new Date().getHours();
  const eatenOn = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : new Date().toISOString().slice(0, 10);

  let parsed;
  try {
    parsed = await parseDictation({ text, hour });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't read that." },
      { status: 502 }
    );
  }

  if (parsed.items.length === 0) {
    return NextResponse.json({ error: "No food found in that. Try naming what you ate." }, { status: 422 });
  }

  try {
    // Sequential rather than parallel: a repeat meal is all table hits and
    // costs nothing, and the misses are few enough that firing four searches at
    // once buys little and makes a rate limit the common failure.
    const items = [];
    for (const item of parsed.items) {
      items.push(await resolveItem({ name: item.name, quantity: item.quantity, onDate: eatenOn }));
    }

    const draft: Draft = { dictated_text: text, meal: isMeal(parsed.meal) ? parsed.meal : "snack", eaten_on: eatenOn, items };
    return NextResponse.json({ draft });
  } catch (e) {
    // A LookupError is a broken database, and it surfaces rather than
    // degrading into "everything is new, estimate it all". That degradation is
    // invisible on screen and is exactly what guardrail 2 forbids.
    if (e instanceof LookupError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't build that draft." },
      { status: 500 }
    );
  }
}
