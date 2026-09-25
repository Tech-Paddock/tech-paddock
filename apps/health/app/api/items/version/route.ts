import { NextRequest, NextResponse } from "next/server";
import { addVersion, versionsOf, eraFor, LookupError } from "@/lib/items";
import { parseMacros } from "@/lib/macros";

export const dynamic = "force-dynamic";

/**
 * Record a new version of a food's numbers. Append-only — guardrail 3.
 *
 * **The `kind` is the whole of this route**, and the two are not
 * interchangeable:
 *
 * - `correction` — the number was always wrong. It takes the `effective_from`
 *   of the era in effect on the given date, so it supersedes inside that era.
 * - `change` — the food itself changed. It takes its own date and starts a new
 *   era, so a log dated before it still picks up the older numbers.
 *
 * Neither moves a day already logged: those carry a snapshot (TEC-21).
 *
 * **A change must carry the date the food changed, not the date you noticed.**
 * Defaulting that would silently misdate the boundary, and the boundary is the
 * only thing a change means.
 */
/**
 * A food's whole history, newest era first.
 *
 * This exists so the append-only guarantee is **visible** rather than merely
 * true. A correction that silently replaced the figure it beat would look
 * identical on screen to one that kept it; showing the older rows is what makes
 * "nothing was overwritten" something you can check instead of something you
 * are told.
 */
export async function GET(request: NextRequest) {
  const itemId = request.nextUrl.searchParams.get("item_id") ?? "";
  if (!itemId) return NextResponse.json({ error: "Which food?" }, { status: 400 });

  try {
    const versions = await versionsOf(itemId);
    return NextResponse.json({ versions });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't read that history." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const itemId = typeof body.item_id === "string" ? body.item_id : "";
  const macros = parseMacros(body.macros);
  const kind = body.kind === "change" ? "change" : "correction";

  if (!itemId) return NextResponse.json({ error: "Which food?" }, { status: 400 });
  if (!macros) return NextResponse.json({ error: "Those numbers are not usable." }, { status: 400 });

  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : new Date().toISOString().slice(0, 10);

  if (kind === "change" && !/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "")) {
    return NextResponse.json(
      { error: "A change needs the date the food changed — not today's date by default." },
      { status: 400 }
    );
  }

  try {
    const existing = await versionsOf(itemId);
    const version = await addVersion({
      itemId,
      macros,
      kind,
      // A correction belongs to the era it corrects; a change starts its own.
      effectiveFrom: kind === "correction" ? eraFor(existing, date) : date,
      source: "hand",
      model: null,
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
    });
    return NextResponse.json({ version }, { status: 201 });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't record that." },
      { status: 500 }
    );
  }
}
