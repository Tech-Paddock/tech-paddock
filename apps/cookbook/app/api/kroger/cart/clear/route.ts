import { NextRequest, NextResponse } from "next/server";
import { readList, markCleared } from "@/lib/grocery";
import { clearedWords } from "@/lib/takeBack";
import { CHECKOUT_URL } from "@/lib/kingsoopers";
import { InputError } from "@/lib/errors";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

/**
 * Clear cart (TEC-228). **Cookbook's list only: Kroger is never called**, because
 * its Cart API cannot remove and refused every negative quantity we sent. Every
 * In cart line (`sent_at` set, not cleared) is marked cleared (`cleared_at`), so it
 * leaves the grocery list; the line and its ledger rows are kept. Needs
 * `confirm: true`, the second tap. No model, no token.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  try {
    if (body.confirm !== true) throw new InputError("Clear cart needs a second tap to confirm.");
    const inCart = (await readList()).filter((l) => l.sent_at !== null);
    if (inCart.length === 0) throw new InputError("Nothing is in the cart on this list.");
    await markCleared(inCart.map((l) => l.id), new Date().toISOString());
    return NextResponse.json({ cleared: inCart.length, text: clearedWords(inCart.length), checkoutUrl: CHECKOUT_URL });
  } catch (e) {
    return errorResponse(e, "Couldn't clear the cart.");
  }
}
