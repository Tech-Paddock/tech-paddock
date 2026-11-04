import { NextRequest, NextResponse } from "next/server";
import { readList, markUnsent } from "@/lib/grocery";
import { BACK_TO_LIST_WORDS } from "@/lib/takeBack";
import { InputError } from "@/lib/errors";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

/**
 * Back to list (TEC-228). **Cookbook's list only: Kroger is never called.** The
 * In cart line `id` goes back to the List unsent (`sent_at` cleared), so it can be
 * sent again or ticked. No confirm. Refresh cart does not put it back In cart
 * (`lib/cartRefresh.ts` no longer marks a line sent from the ledger).
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  try {
    const id = typeof body.id === "string" ? body.id : "";
    const line = (await readList()).find((l) => l.id === id);
    if (!line || line.sent_at === null) throw new InputError("That line isn't in the cart.");
    await markUnsent([id]);
    return NextResponse.json({ id, text: BACK_TO_LIST_WORDS });
  } catch (e) {
    return errorResponse(e, "Couldn't move that back to the list.");
  }
}
