import { NextRequest, NextResponse } from "next/server";
import { addItems, readList, removeItems, setChecked } from "@/lib/grocery";
import { LookupError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/**
 * The shopping list. **No model call on any verb here** — tidying is its own
 * route, because it is the only thing on this screen that needs judgement and it
 * should be visible in the URL that it does.
 *
 * This reads and writes `cookbook.grocery_items`. Health's `health.grocery_items`
 * is a different table belonging to a different app, and moving that one is the
 * technical director's (ledger item 23).
 */

/** A failed read is a 503, never an empty list — an empty list means "buy nothing". */
export async function GET() {
  try {
    return NextResponse.json({ items: await readList() });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: "Couldn't read the list." }, { status: 500 });
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
    const items = await addItems(lines.map((name: string) => ({ name, source: "manual" as const })));
    return NextResponse.json({ items }, { status: 201 });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: "Couldn't add that." }, { status: 500 });
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
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: "Couldn't tick that off." }, { status: 500 });
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
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: "Couldn't remove those." }, { status: 500 });
  }
}
