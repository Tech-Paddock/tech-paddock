import { NextRequest, NextResponse } from "next/server";
import { readList } from "@/lib/grocery";
import { readPreferences } from "@/lib/preferences";
import { decider } from "@/lib/decide";
import { searchProducts } from "@/lib/kroger";
import { withAccessToken } from "@/lib/krogerConnection";
import { readProducts } from "@/lib/productStore";
import { purchasesForPicking } from "@/lib/purchaseStore";
import { CHECK_RESULTS, planLine, type CartLine, type Plan } from "@/lib/cart";
import { matchView, searchHrefFor, type Reach } from "@/lib/itemMatches";
import { ConflictError, InputError } from "@/lib/errors";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * **The popup behind a grocery item's name** (TEC-226). Read-only: it never adds to the cart,
 * never writes a default or a product, and returns no token. Signed in only like every `/api`
 * route (`proxy.ts` unchanged). Any line, in cart or not, ticked or not.
 *
 * It plans the line the way Send does (`planLine`), so the products are the ones Send would
 * choose among. When King Soopers cannot be asked (not connected, no store, no answer) the plan
 * is made from the saved products alone, and the body says why in `note`.
 */
export async function GET(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) throw new InputError("Which line?");

    const [list, words, products, purchases] = await Promise.all([readList(), readPreferences(), readProducts(), purchasesForPicking()]);
    const item = list.find((i) => i.id === id);
    if (!item) throw new ConflictError("That line isn't on the list any more.");
    const line: CartLine = { id: item.id, name: item.name, note: item.note, quantity: item.quantity, sent_at: item.sent_at };
    const decide = decider(products, words, purchases);

    let plan: Plan;
    let reach: Reach = { ok: true };
    try {
      plan = await withAccessToken(async (accessToken, store) => {
        if (!store) throw new ConflictError("Pick a store first, so the matches are from your King Soopers.");
        return planLine(line, decide, (term) => searchProducts(accessToken, term, store.locationId, CHECK_RESULTS));
      });
    } catch (e) {
      const why = e instanceof Error ? e.message : "Couldn't reach King Soopers.";
      reach = { ok: false, why: `${why} Showing what Cookbook has saved.` };
      plan = await planLine(line, decide, async () => {
        throw new Error(why);
      });
    }

    return NextResponse.json(matchView(plan, searchHrefFor(line.name, line.note, decide(line.name, line.note)), reach));
  } catch (e) {
    return errorResponse(e, "Couldn't look up the matches.");
  }
}
