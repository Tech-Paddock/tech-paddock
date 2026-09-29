import { NextRequest, NextResponse } from "next/server";
import { LookupError } from "@/lib/items";
import { deleteEntry } from "@/lib/entries";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Delete a logged meal and its lines (TEC-53). **Never the food**: the items
 * and their versions stay, so logging it again later still finds your numbers.
 * Database only — no model.
 */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  // A malformed id would reach Postgres as a cast error and read as an outage.
  if (!UUID.test(params.id)) {
    return NextResponse.json({ error: "That meal isn't in your log." }, { status: 404 });
  }
  try {
    const deleted = await deleteEntry(params.id);
    if (!deleted) return NextResponse.json({ error: "That meal isn't in your log." }, { status: 404 });
    return NextResponse.json({ deleted: params.id });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't delete that meal." },
      { status: 500 },
    );
  }
}
