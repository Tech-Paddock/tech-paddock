import { NextRequest, NextResponse } from "next/server";
import { addItems, readList, removeItems, setChecked, splitLine } from "@/lib/grocery";
import { errorResponse } from "@/lib/respond";
import { readPreferences, resolveLink } from "@/lib/preferences";

export const dynamic = "force-dynamic";

/**
 * The shopping list. **No model call on any verb here** — tidying is its own
 * route, because it is the only thing on this screen that needs judgement and it
 * should be visible in the URL that it does.
 *
 * This reads and writes `cookbook.grocery_items`. Health's `health.grocery_items`
 * is a different table belonging to a different app, and moving that one is the
 * technical director's (TEC-15).
 */

/**
 * A failed read is a 503, never an empty list — an empty list means "buy nothing".
 *
 * **Each line comes back carrying the link it should have.** The match against
 * remembered brands is resolved here rather than in the browser: the preferences
 * are the whole table on every render, and a phone in a shop should be handed an
 * answer rather than the data to work one out.
 */
export async function GET() {
  try {
    const [items, preferences] = await Promise.all([readList(), readPreferences()]);
    return NextResponse.json({
      items: items.map((item) => ({ ...item, ...resolveLink(item, preferences) })),
    });
  } catch (e) {
    return errorResponse(e, "Couldn't read the list.");
  }
}

/** Add lines by hand. One per line of text, which is how a list actually gets typed. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const lines = Array.isArray(body.lines)
    ? body.lines
        .map((l: unknown) => (typeof l === "string" ? l.trim() : ""))
        .filter((l: string) => l.length > 0)
    : [];

  if (lines.length === 0) return NextResponse.json({ error: "Nothing to add." }, { status: 400 });

  try {
    // "Milk — the small tin" is a name and a note; only the name is searched.
    const items = await addItems(lines.map((line: string) => ({ ...splitLine(line), source: "manual" as const })));
    return NextResponse.json({ items }, { status: 201 });
  } catch (e) {
    return errorResponse(e, "Couldn't add that.");
  }
}

/**
 * Tick a line off, or back on.
 *
 * **Ticked is not deleted**, deliberately: the list survives a mis-tap in a shop,
 * and a tidy can leave already-bought lines alone.
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Which line?" }, { status: 400 });
  if (typeof body.checked !== "boolean") {
    return NextResponse.json({ error: "Ticked or not ticked?" }, { status: 400 });
  }

  try {
    await setChecked(id, body.checked);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Couldn't tick that off.");
  }
}

/** Remove lines outright — one you typed by mistake, or everything already bought. */
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.filter((i: unknown): i is string => typeof i === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "Which lines?" }, { status: 400 });

  try {
    await removeItems(ids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Couldn't remove those.");
  }
}
