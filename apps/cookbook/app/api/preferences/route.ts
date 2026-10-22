import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/respond";
import { readBrandProducts } from "@/lib/krogerStore";
import { readBatch } from "@/lib/brandBatch";
import {
  importPreferences,
  readDraft,
  readPreferences,
  removePreference,
  savePreference,
} from "@/lib/preferences";

export const dynamic = "force-dynamic";

/**
 * Remembered brands. **No model call on any verb here.**
 *
 * The aggregation that turns a purchase history into preferences happens
 * somewhere else — a session with the history in front of it — and arrives here
 * as rows. **This route is the gate, not the author**: it validates every row
 * before writing any, it reports what it refused rather than dropping it, and
 * (TEC-51) it never overwrites a saved row unless the review ticked it
 * (`replace: true`). The review itself is `POST /api/preferences/preview`,
 * which writes nothing.
 */

/**
 * The brands, and what Kroger last said about each exact product (TEC-90's
 * refresh) — price, stock, and a flag when Kroger stopped returning it.
 * `products` is keyed by the brand's id; a brand with none has not been checked.
 */
export async function GET() {
  try {
    const [preferences, products] = await Promise.all([readPreferences(), readBrandProducts()]);
    return NextResponse.json({
      preferences,
      products: Object.fromEntries(products.map((p) => [p.preference_id, p])),
    });
  } catch (e) {
    return errorResponse(e, "Couldn't read your brands.");
  }
}

/**
 * One preference from the editor — with `id` when it edits that row — or the
 * ticked rows of a Paste a batch review (format: NOTES.md).
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  try {
    if (Array.isArray(body.rows)) {
      if (body.rows.length === 0) {
        return NextResponse.json({ error: "Nothing to import." }, { status: 400 });
      }
      const { entries, refused } = readBatch(body.rows);
      return NextResponse.json(
        await importPreferences(
          entries,
          refused.map((r) => ({ row: r.row, reason: r.reason }))
        )
      );
    }

    const read = readDraft(body);
    if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });
    // The editor never sets a count; only a batch does.
    delete read.row.tally;
    const id = typeof body.id === "string" && body.id ? body.id : undefined;
    return NextResponse.json({ preference: await savePreference(read.row, undefined, { id }) });
  } catch (e) {
    return errorResponse(e, "Couldn't save that.");
  }
}

/** Forget one. The line goes back to a plain search, which is where it started. */
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "Which one?" }, { status: 400 });
  }

  try {
    await removePreference(body.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Couldn't forget that one.");
  }
}
