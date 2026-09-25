import { NextRequest, NextResponse } from "next/server";
import { saveEntry, DraftError, type Draft, type DraftItem } from "@/lib/log";
import { LookupError, normalizeName } from "@/lib/items";
import { isMeal } from "@/lib/meals";
import { parseMacros } from "@/lib/macros";

export const dynamic = "force-dynamic";

const SOURCES = ["hand", "web", "estimate"];

/**
 * Approve a draft. **The only route in this app that writes to the log.**
 *
 * The draft comes back from the browser where it may have been edited, so every
 * field is re-validated here rather than trusted. `saveEntry` re-resolves every
 * line and refuses one whose draft no longer matches the table — a line renamed
 * after its lookup, or numbers that differ without being typed over.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const raw = body?.draft as Partial<Draft> | undefined;

  if (!raw || typeof raw.dictated_text !== "string" || !raw.dictated_text.trim()) {
    return NextResponse.json({ error: "That draft has nothing in it." }, { status: 400 });
  }
  if (!isMeal(raw.meal)) {
    return NextResponse.json({ error: "Pick a meal first." }, { status: 400 });
  }
  if (typeof raw.eaten_on !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.eaten_on)) {
    return NextResponse.json({ error: "That date is not a date." }, { status: 400 });
  }
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    return NextResponse.json({ error: "Nothing to log." }, { status: 400 });
  }

  const items: DraftItem[] = [];
  for (const line of raw.items) {
    const l = line as Partial<DraftItem>;
    const name = typeof l.name === "string" ? l.name.trim() : "";
    const macros = parseMacros(l.macros);
    const quantity = Number(l.quantity);

    // A name of only punctuation normalises to nothing, which the database
    // refuses; that is the request's fault, so a 400 rather than a 503.
    if (!name || !normalizeName(name)) return NextResponse.json({ error: "A line has no name." }, { status: 400 });
    if (!macros) return NextResponse.json({ error: `"${name}" has no usable numbers.` }, { status: 400 });
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: `"${name}" needs a quantity above zero.` }, { status: 400 });
    }

    const source = typeof l.source === "string" && SOURCES.includes(l.source) ? l.source : "estimate";
    items.push({
      name,
      quantity,
      macros,
      source: source as DraftItem["source"],
      model: source === "hand" ? null : (typeof l.model === "string" ? l.model : null),
      source_url: typeof l.source_url === "string" ? l.source_url : null,
      note: typeof l.note === "string" ? l.note : null,
      known: l.known === true,
      item_id: typeof l.item_id === "string" ? l.item_id : null,
      // A line that failed is refused by saveEntry, never logged as zero.
      error: typeof l.error === "string" && l.error ? l.error : null,
    });
  }

  try {
    const saved = await saveEntry({
      dictated_text: raw.dictated_text.trim(),
      meal: raw.meal,
      eaten_on: raw.eaten_on,
      items,
    });
    return NextResponse.json(saved, { status: 201 });
  } catch (e) {
    if (e instanceof DraftError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't log that." },
      { status: 500 }
    );
  }
}
