import { NextRequest, NextResponse } from "next/server";
import { LookupError } from "@/lib/errors";
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
 * The aggregation that turns a stack of receipts into preferences happens
 * somewhere else — a session with the receipts in front of it — and arrives here
 * as rows. **This route is the gate, not the author**: it validates every row
 * before writing any, and it reports what it refused rather than dropping it.
 */

export async function GET() {
  try {
    return NextResponse.json({ preferences: await readPreferences() });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: "Couldn't read your brands." }, { status: 500 });
  }
}

/** One preference from a tap, or a batch from a receipts session. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  try {
    if (Array.isArray(body.rows)) {
      if (body.rows.length === 0) {
        return NextResponse.json({ error: "Nothing to import." }, { status: 400 });
      }
      return NextResponse.json(await importPreferences(body.rows));
    }

    const read = readDraft(body);
    if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });
    return NextResponse.json({ preference: await savePreference(read.row) });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: "Couldn't save that." }, { status: 500 });
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
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: "Couldn't forget that one." }, { status: 500 });
  }
}
