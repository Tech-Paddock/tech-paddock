import { NextRequest, NextResponse } from "next/server";
import { resolveItem } from "@/lib/log";
import { LookupError } from "@/lib/items";

export const dynamic = "force-dynamic";
// A miss goes outside, which may search and read a page.
export const maxDuration = 120;

/**
 * One food, looked up again — what a draft line does after it is renamed.
 *
 * A rename used to keep the old food's numbers and provenance, so approving
 * stored them against the new name. The screen now clears the line and asks
 * here, in the same lookup order as the first draft: the table, then outside.
 * **Writes nothing** — guardrail 1.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name the food first." }, { status: 400 });
  if (name.length > 200) return NextResponse.json({ error: "That is longer than one food." }, { status: 413 });

  const quantity = Number(body.quantity);
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  if (!date) return NextResponse.json({ error: "Send the day it was eaten." }, { status: 400 });

  try {
    const item = await resolveItem({
      name,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      onDate: date,
    });
    return NextResponse.json({ item });
  } catch (e) {
    // A broken database surfaces; it never becomes "new food, estimate it".
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't look that up." },
      { status: 500 }
    );
  }
}
