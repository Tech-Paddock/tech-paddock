import { NextRequest, NextResponse } from "next/server";
import { readList, markSent, type GroceryItem } from "@/lib/grocery";
import { readDraft, readPreferences, savePreference } from "@/lib/preferences";
import { decider } from "@/lib/decide";
import { addToCart, topProduct } from "@/lib/kroger";
import { withAccessToken } from "@/lib/krogerConnection";
import { readBrandProducts } from "@/lib/krogerStore";
import {
  alreadySent,
  readPicks,
  repeatsIn,
  reviewLines,
  RepeatSendError,
  modalityWarning,
  sendLines,
  summarize,
  type CartLine,
} from "@/lib/cart";
import { CHECKOUT_URL } from "@/lib/kingsoopers";
import { ConflictError, InputError } from "@/lib/errors";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

/**
 * Send to cart (TEC-90). **No model call on either verb**: Kroger's own search
 * picks the top match, and the user confirms it.
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
    const [open, preferences, products] = await Promise.all([openLines(), readPreferences(), readBrandProducts()]);
    const decide = decider(preferences, products);

    const lines = await withAccessToken(async (accessToken, store) => {
      if (!store) throw new ConflictError("Pick a store first, so the matches are from your King Soopers.");
      return reviewLines(open, decide, (term) => topProduct(accessToken, term, store.locationId));
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

    const { outcomes, modality } = await withAccessToken(async (accessToken, _store, modality) => ({
      modality,
      outcomes: await sendLines(
        { open, picks, again, modality },
        {
          // Pickup or Delivery goes with each line; a refusal is retried once without it (lib/cart.ts).
          add: (upc, quantity, m) => addToCart(accessToken, upc, quantity, m),
          // **A replacement is remembered in Your brands** (RULES.md), through
          // the same validation as the editor.
          remember: async (phrase, url) => {
            const read = readDraft({ phrase, kind: "product", url });
            if ("error" in read) throw new InputError(read.error);
            await savePreference(read.row);
          },
        }
      ),
    }));

    const added = outcomes.filter((o) => o.result === "added").map((o) => o.id);
    let recordError: string | null = null;
    try {
      await markSent(added, new Date().toISOString());
    } catch {
      recordError = "These are in the cart, but this app couldn't record it — a second send won't warn about them.";
    }

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
