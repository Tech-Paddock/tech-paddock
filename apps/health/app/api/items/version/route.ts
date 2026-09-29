import { NextRequest, NextResponse } from "next/server";
import { addVersion, versionsOf, eraFor, itemById, LookupError } from "@/lib/items";
import { recipeBookFor, isRecipe, fromCookbook, fixItInTheCookbook } from "@/lib/cookbook";
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

  // Always the phone's date, never a UTC fallback. For a change it is the date
  // the food changed; for a correction, today, which picks the era it corrects.
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  if (!date) {
    return NextResponse.json(
      { error: kind === "change" ? "A change needs the date the food changed — not today's date by default." : "Send today's date." },
      { status: 400 }
    );
  }

  try {
    // A Cookbook recipe's numbers are the Cookbook's (TEC-25). A correction
    // here would be bypassed by the next log, which asks the Cookbook first, so
    // it is refused rather than stored to be ignored. An unreachable Cookbook
    // is a 503 like a broken database, never "not a recipe".
    const item = await itemById(itemId);
    if (!item) return NextResponse.json({ error: "That food isn't in your log." }, { status: 404 });
    if (await isRecipe(recipeBookFor(request.cookies), item.name, async () => fromCookbook(await versionsOf(itemId)))) {
      return NextResponse.json({ error: fixItInTheCookbook(item.name) }, { status: 409 });
    }

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
