import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/respond";
import { previewBatch } from "@/lib/brandBatch";
import { readProducts } from "@/lib/productStore";
import { readPreferences } from "@/lib/preferences";

export const dynamic = "force-dynamic";

/**
 * Paste a batch, step one (TEC-131): **every row as it would be written,
 * against what is saved now, and nothing written.** The tab shows each with a
 * tick; only the ticked ones go to `POST /api/brands/import`.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "Expected a JSON array of rows." }, { status: 400 });
  }
  try {
    const [products, words] = await Promise.all([readProducts(), readPreferences()]);
    return NextResponse.json({ entries: previewBatch(body.rows, products, words) });
  } catch (e) {
    return errorResponse(e, "Couldn't review that batch.");
  }
}
