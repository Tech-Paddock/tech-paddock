import { NextRequest, NextResponse } from "next/server";
import { readList } from "@/lib/grocery";
import { readPreferences } from "@/lib/preferences";
import { decider } from "@/lib/decide";
import { searchProducts } from "@/lib/kroger";
import { withAccessToken } from "@/lib/krogerConnection";
import { readProducts } from "@/lib/productStore";
import { purchasesForPicking } from "@/lib/purchaseStore";
import { withPicks } from "@/lib/linePick";
import { CHECK_RESULTS, type CartLine } from "@/lib/cart";
import { MIRROR_MAX, mirrorLines } from "@/lib/mirror";
import { ConflictError } from "@/lib/errors";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * **In cart mirrors the List** (TEC-227): for each unsent List line, the exact product a send
 * would put in the cart now, by the same picking (`planLine`). Read-only: it never adds to the
 * cart, never writes a default, a name or a product, and returns no token. Signed in only like
 * every `/api` route (`proxy.ts` unchanged).
 *
 * **Batched, and Kroger is asked only when it has to be.** A line Your brands settles (a pick, a
 * default, the only saved product, the pack that fits) is resolved here with no Kroger call. Only
 * the lines left over borrow the account's token, once, for the whole batch, four searches at a
 * time (`mirrorLines`); the page calls this inside `serialKroger` with every other call that
 * borrows the token. **A failure degrades to `unknown`** for those lines (they read as the plain
 * word) and never fails the request, so it can never block the list.
 *
 * `?ids=a,b` limits it to those lines; at most `MIRROR_MAX` are resolved per request.
 */
export async function GET(request: NextRequest) {
  try {
    const only = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((i) => i.trim()).filter(Boolean);
    const [list, words, products, purchases] = await Promise.all([readList(), readPreferences(), readProducts(), purchasesForPicking()]);
    const decide = withPicks(decider(products, words, purchases), products);

    const lines: CartLine[] = list
      .filter((i) => i.sent_at === null && !i.checked && (only.length === 0 || only.includes(i.id)))
      .slice(0, MIRROR_MAX)
      .map((i) => ({ id: i.id, name: i.name, note: i.note, quantity: i.quantity, sent_at: i.sent_at, picked: i.picked }));

    // Pass one: no Kroger. Whatever Your brands settles is final; the rest comes back `unknown`.
    const rows = await mirrorLines(lines, decide, null);

    // Pass two: the lines only a Kroger search can settle, in one borrow of the token.
    const left = lines.filter((_, i) => rows[i].state === "unknown");
    if (left.length > 0) {
      try {
        const asked = await withAccessToken(async (accessToken, store) => {
          if (!store) throw new ConflictError("Pick a store first, so the matches are from your King Soopers.");
          return mirrorLines(left, decide, (term) => searchProducts(accessToken, term, store.locationId, CHECK_RESULTS));
        });
        for (const row of asked) {
          const at = rows.findIndex((r) => r.id === row.id);
          if (at !== -1) rows[at] = row;
        }
      } catch {
        // Not connected, no store or no answer: those lines stay `unknown` and read as the word.
      }
    }

    return NextResponse.json({ rows });
  } catch (e) {
    return errorResponse(e, "Couldn't work out what the List would send.");
  }
}
