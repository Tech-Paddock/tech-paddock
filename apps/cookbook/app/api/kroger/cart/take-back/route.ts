import { NextRequest, NextResponse } from "next/server";
import { readList, markUnsent } from "@/lib/grocery";
import { appendSends, readSends } from "@/lib/cartSends";
import { takeBackFromCart } from "@/lib/kroger";
import { withAccessToken } from "@/lib/krogerConnection";
import { summarizeTakeBack, takeBack, takeBackLines, type Held, type TakeBackLine, type TakeBackOutcome } from "@/lib/takeBack";
import { CHECKOUT_URL } from "@/lib/kingsoopers";
import { InputError } from "@/lib/errors";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

/**
 * Take back (TEC-127; rules in `lib/takeBack.ts`). **No model call.**
 *
 * GET is what a take-back would remove — read from the ledger, no Kroger call —
 * so the confirm shows it. POST takes it back; it needs `confirm: true`, the
 * second tap, because it can't be undone from here. **No token in either body.**
 */

async function lines(): Promise<TakeBackLine[]> {
  const list = await readList();
  const rows = await readSends(list.map((l) => l.id));
  return takeBackLines(list, rows);
}

export async function GET() {
  try {
    return NextResponse.json({ lines: await lines(), checkoutUrl: CHECKOUT_URL });
  } catch (e) {
    return errorResponse(e, "Couldn't read what Cookbook sent to the cart.");
  }
}

function ledger(line: TakeBackLine, held: Held[], kind: "taken_back" | "refused") {
  return held.map((h) => ({
    item_id: line.id,
    name: line.name,
    kind,
    upc: h.upc,
    quantity: kind === "taken_back" ? -h.quantity : h.quantity,
    modality: h.modality,
  }));
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  try {
    if (body.confirm !== true) throw new InputError("Take back needs a second tap to confirm.");
    const todo = await lines();
    if (todo.length === 0) throw new InputError("Cookbook hasn't sent anything on this list to the cart.");

    const run = (remove: (upc: string, quantity: number, modality: Held["modality"]) => Promise<void>) =>
      takeBack(todo, {
        reserve: (line, held) => appendSends(ledger(line, held, "taken_back")),
        remove,
        refused: (line, held) => appendSends(ledger(line, held, "refused")),
      });

    // Kroger is only asked for a sign-in when something recorded is held; a
    // list sent before the ledger existed is skipped line by line, without one.
    // (Every line is then skipped, so `remove` is never called.)
    const { outcomes, unsent }: { outcomes: TakeBackOutcome[]; unsent: string[] } = todo.some((l) => l.held.length > 0)
      ? await withAccessToken((accessToken) => run((upc, quantity, modality) => takeBackFromCart(accessToken, upc, quantity, modality)))
      : await run(() => Promise.reject(new Error("Not signed in to Kroger.")));

    let recordError: string | null = null;
    try {
      await markUnsent(unsent);
    } catch {
      recordError = "Taken back, but this app couldn't mark those lines unsent — a send will still warn about them.";
    }

    return NextResponse.json({
      outcomes,
      summary: summarizeTakeBack(outcomes),
      recordError,
      failed: outcomes.some((o) => o.result !== "taken back"),
      checkoutUrl: CHECKOUT_URL,
    });
  } catch (e) {
    return errorResponse(e, "Couldn't take back from the cart.");
  }
}
