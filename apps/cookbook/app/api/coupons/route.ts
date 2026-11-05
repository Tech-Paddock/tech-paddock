import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/respond";
import { importCoupons } from "@/lib/couponStore";

export const dynamic = "force-dynamic";

const MAX_TEXT = 500_000;

/**
 * Import coupons (TEC-230): the pasted digital coupons, one JSON object per
 * line, written append-only to `cookbook.coupons`. **Signed in like every
 * `/api` route**: the weekly Chrome task pastes it from the owner's own
 * browser. No model call. Format: NOTES.md, *Import coupons*.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (typeof body.text !== "string" || body.text.trim() === "") {
    return NextResponse.json({ error: "Paste the coupons first." }, { status: 400 });
  }
  if (body.text.length > MAX_TEXT) {
    return NextResponse.json({ error: "That is too much to paste at once. Paste fewer coupons." }, { status: 413 });
  }
  try {
    return NextResponse.json(await importCoupons(body.text));
  } catch (e) {
    return errorResponse(e, "Couldn't save those coupons.");
  }
}
