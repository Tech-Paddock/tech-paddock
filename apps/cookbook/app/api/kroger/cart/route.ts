import { NextRequest, NextResponse } from "next/server";
import { readList, markSent, splitLine, type GroceryItem } from "@/lib/grocery";
import { readPreferences } from "@/lib/preferences";
import { decider } from "@/lib/decide";
import { addToCart, searchProducts } from "@/lib/kroger";
import { withAccessToken } from "@/lib/krogerConnection";
import { bumpCounts, readProducts, rememberProduct, setDefault } from "@/lib/productStore";
import { appendSends } from "@/lib/cartSends";
import {
  CHECK_RESULTS,
  alreadySent,
  readPicks,
  repeatsIn,
  reviewLines,
  RepeatSendError,
  modalityWarning,
  sendLines,
  sentRows,
  summarize,
  type CartLine,
} from "@/lib/cart";
import { CHECKOUT_URL } from "@/lib/kingsoopers";
import { ConflictError, InputError } from "@/lib/errors";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

/**
 * Send to cart (TEC-90). **No model call on either verb**: Your brands decides
 * what it can (TEC-131), Kroger's own search picks the top match for the rest,
 * and the user confirms it. **A product found only by its Kroger name is
 * checked against Kroger's own search for the item** (TEC-135), so the review
 * reads up to `CHECK_RESULTS` results per search, not one.
 *
 * GET is the review — every open line with what it would become. POST is the
 * send — the lines the user chose, each reported added, skipped or failed.
 * **No token in either body**; `tests/kroger.test.ts` reads both for one.
 */

function cartLine(item: GroceryItem): CartLine {
  return { id: item.id, name: item.name, note: item.note, quantity: item.quantity, sent_at: item.sent_at };
}

async function openLines(): Promise<CartLine[]> {
  return (await readList()).filter((i) => !i.checked).map(cartLine);
}

export async function GET() {
  try {
    const [open, words, products] = await Promise.all([openLines(), readPreferences(), readProducts()]);
    const decide = decider(products, words);

    const lines = await withAccessToken(async (accessToken, store) => {
      if (!store) throw new ConflictError("Pick a store first, so the matches are from your King Soopers.");
      return reviewLines(open, decide, (term) => searchProducts(accessToken, term, store.locationId, CHECK_RESULTS));
    });

    return NextResponse.json({ lines, alreadySent: alreadySent(open), checkoutUrl: CHECKOUT_URL });
  } catch (e) {
    return errorResponse(e, "Couldn't get the list ready for the cart.");
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const picks = readPicks(body.picks);
  const again = body.again === true;

  try {
    const open = await openLines();
    if (picks.length === 0) throw new InputError("Nothing chosen to send.");

    // **Before Kroger is touched**: a repeat refused after the sign-in renewed is
    // harmless, but one refused after half the list went in is the partial send
    // this exists to prevent.
    if (!again) {
      const repeats = repeatsIn(open, picks);
      if (repeats.length > 0) throw new RepeatSendError(repeats);
    }

    // **Make default** (TEC-135): the name each ticked line matched, read
    // *before* the send, because remembering a pick can add the line's own
    // name to the product and change what the line matches afterwards.
    const defaultNames = new Map<string, string>();
    if (picks.some((p) => p.makeDefault)) {
      const [words, products] = await Promise.all([readPreferences(), readProducts()]);
      const decide = decider(products, words);
      for (const line of open) {
        if (!picks.some((p) => p.id === line.id && p.makeDefault)) continue;
        const decision = decide(line.name);
        if (decision?.kind === "products" && decision.matched) defaultNames.set(line.id, decision.matched);
      }
    }

    const { outcomes, modality } = await withAccessToken(async (accessToken, _store, modality) => ({
      modality,
      outcomes: await sendLines(
        { open, picks, again, modality },
        {
          // Pickup or Delivery goes with each line; a refusal is retried once without it (lib/cart.ts).
          add: (upc, quantity, m) => addToCart(accessToken, upc, quantity, m),
          // **What went in is remembered in Your brands** (RULES.md, TEC-128,
          // TEC-131): a pick, a replacement or the tapped match — the line's
          // name (never its note) added to that product's names, or a new
          // product row. `sendLines` calls this only after the add succeeded.
          remember: (name, page, upc, size) => rememberProduct(splitLine(name).name, upc, page, size),
          // Only for a name that matched several saved products (RULES.md).
          makeDefault: async (line, upc) => {
            const name = defaultNames.get(line.id);
            if (!name) throw new ConflictError("this line no longer matches a saved name");
            await setDefault([name], upc);
          },
        }
      ),
    }));

    const added = outcomes.filter((o) => o.result === "added").map((o) => o.id);
    const problems: string[] = [];
    // **What actually went in** — product, quantity, mode — so Take back
    // removes that, not whatever the line says later (TEC-127).
    try {
      await appendSends(sentRows(outcomes, modality));
    } catch {
      problems.push("Take back won't know about them — remove them on the King Soopers cart page if you need to.");
    }
    try {
      await markSent(added, new Date().toISOString());
    } catch {
      problems.push("A second send won't warn about them.");
    }
    // **+1 on each product that went in** (TEC-131), after remembering, so a
    // product saved by this send counts its first add. A failure is said;
    // the items are in the cart either way.
    try {
      await bumpCounts(outcomes.flatMap((o) => (o.result === "added" && o.upc ? [o.upc] : [])));
    } catch {
      problems.push("The counts in Your brands didn't go up.");
    }
    const recordError = problems.length > 0 ? `These are in the cart, but this app couldn't record it. ${problems.join(" ")}` : null;

    return NextResponse.json({
      outcomes,
      summary: summarize(outcomes),
      recordError,
      modality,
      modalityWarning: modalityWarning(outcomes, modality),
      checkoutUrl: CHECKOUT_URL,
    });
  } catch (e) {
    if (e instanceof RepeatSendError) {
      return NextResponse.json({ error: e.message, alreadySent: e.lines }, { status: 409 });
    }
    return errorResponse(e, "Couldn't send to the cart.");
  }
}
