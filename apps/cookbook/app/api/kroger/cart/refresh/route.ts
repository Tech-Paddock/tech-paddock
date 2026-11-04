import { NextResponse } from "next/server";
import { readList, markUnsent } from "@/lib/grocery";
import { readSends } from "@/lib/cartSends";
import { readConnectionRow } from "@/lib/krogerStore";
import { appToken, productsByIds } from "@/lib/kroger";
import { refreshCart } from "@/lib/cartRefresh";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * **Refresh cart** (TEC-206; rules in `lib/cartRefresh.ts`). Re-checks every line
 * Cookbook sent against the ledger, fixes In cart to agree with it, and prices
 * each In cart line today at the chosen store with Kroger's **app** token
 * (product read), **never the owner's account token**: this route does not call
 * `withAccessToken`. No model call. The body carries no token.
 *
 * POST, because it writes (a line the ledger disagrees with is moved); the
 * page calls it on open and on **Refresh cart**.
 */
export async function POST() {
  try {
    return NextResponse.json(
      await refreshCart({
        now: () => new Date(),
        readList: async () => (await readList()).map((i) => ({ id: i.id, name: i.name, sent_at: i.sent_at })),
        readSends,
        markUnsent,
        store: async () => {
          const row = await readConnectionRow();
          return row?.location_id ? { locationId: row.location_id, name: row.store_name ?? row.location_id } : null;
        },
        appToken: () => appToken(),
        byIds: productsByIds,
      })
    );
  } catch (e) {
    return errorResponse(e, "Couldn't refresh the cart.");
  }
}
