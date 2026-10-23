import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/respond";
import { importBatch } from "@/lib/brandImport";

export const dynamic = "force-dynamic";

/**
 * Paste a batch, step two (TEC-131): write **the rows the review ticked**.
 * A saved row changes only when its row carries `replace: true`; every row
 * refused is named.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "Nothing to write." }, { status: 400 });
  }
  try {
    return NextResponse.json(await importBatch(body.rows));
  } catch (e) {
    return errorResponse(e, "Couldn't write those.");
  }
}
