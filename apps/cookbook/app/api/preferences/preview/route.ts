import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/respond";
import { previewBatch } from "@/lib/brandBatch";
import { readPreferences } from "@/lib/preferences";

export const dynamic = "force-dynamic";

/**
 * Paste a batch, step one (TEC-51): **every row as it would be written, against
 * what is saved now, and nothing written.** The list tab shows each with a
 * tick; only the ticked ones go to `POST /api/preferences`.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "Expected a JSON array of rows." }, { status: 400 });
  }
  try {
    return NextResponse.json({ entries: previewBatch(body.rows, await readPreferences()) });
  } catch (e) {
    return errorResponse(e, "Couldn't review that batch.");
  }
}
