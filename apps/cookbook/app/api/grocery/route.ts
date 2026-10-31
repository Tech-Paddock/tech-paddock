import { NextRequest, NextResponse } from "next/server";
import {
  MAX_QUANTITY,
  addItems,
  readList,
  readQuantity,
  removeItems,
  setChecked,
  setQuantity,
  splitLine,
} from "@/lib/grocery";
import { errorResponse } from "@/lib/respond";
import { linkFor, readPreferences } from "@/lib/preferences";
import { readProducts } from "@/lib/productStore";
import { decider } from "@/lib/decide";
import { lineMark } from "@/lib/brands";
import { lineView } from "@/lib/lineView";
import { packOf, quantityRule } from "@/lib/lineQuantity";
import { readConnectionRow } from "@/lib/krogerStore";
import { readNightsSince, readWeeksSince } from "@/lib/priceStore";
import { readCoupons } from "@/lib/couponStore";
import { addDays, denverDate } from "@/lib/priceDates";
import { PRICE_WINDOW_NIGHTS, latestNights, priceLines, productFor, type LinePrice } from "@/lib/listPrices";
import { lineDeals, type LineDeal } from "@/lib/lineDeal";
import { FRESH_NIGHTS } from "@/lib/dealRows";
import { HISTORY_WEEKS } from "@/lib/stoplight";

export const dynamic = "force-dynamic";

/**
 * The shopping list. **No model call on any verb here** — tidying is its own
 * route, because it is the only thing on this screen that needs judgement and it
 * should be visible in the URL that it does.
 *
 * This reads and writes `cookbook.grocery_items`. Send to cart is its own routes
 * under `/api/kroger` (TEC-90).
 */

/**
 * A failed read is a 503, never an empty list — an empty list means "buy nothing".
 *
 * **Each line comes back carrying the link it should have.** The match against
 * Your brands is resolved here rather than in the browser (`lib/brands.ts`
 * `decide`, the same rule Send uses): the products are the whole table on
 * every render, and a phone in a shop should be handed an
 * answer rather than the data to work one out.
 */
export async function GET() {
  try {
    const [items, words, products] = await Promise.all([readList(), readPreferences(), readProducts()]);
    const decide = decider(products, words);
    const decisions = items.map((item) => decide(item.name, item.note));

    // **Prices are the nightly check's** (TEC-190): each line's saved product at
    // its latest night, never a live Kroger call. A failed read is said, and the
    // lines read "no price yet"; it never breaks the list or reads as $0.
    let priceError: string | null = null;
    let dealError: string | null = null;
    let store: string | null = null;
    let prices = new Map<string, LinePrice | null>();
    let deals = new Map<string, LineDeal | null>();
    const asOf = denverDate(new Date());
    const lines = items.map((item, i) => ({ id: item.id, quantity: item.quantity, productId: productFor(decisions[i]) }));
    try {
      const connection = await readConnectionRow();
      if (connection?.location_id) {
        store = connection.store_name ?? connection.location_id;
        // Twelve weeks of nights, not five: the price is the newest night, and
        // Best (TEC-196) compares it with the lowest. One read feeds both.
        const nights = await readNightsSince(connection.location_id, addDays(asOf, -7 * HISTORY_WEEKS));
        prices = priceLines(lines, latestNights(nights.filter((n) => n.night >= addDays(asOf, -PRICE_WINDOW_NIGHTS)), connection.location_id));

        // **The bubble, the shade and Best** (TEC-196): the same nightly rows, plus the
        // weeks and staged coupons the Deals board reads, through the one function
        // it uses. A failed read is said and the lines stay plain; it never breaks the list.
        try {
          const [weeks, { coupons }] = await Promise.all([
            readWeeksSince(connection.location_id, addDays(asOf, -7 * HISTORY_WEEKS)),
            readCoupons(),
          ]);
          deals = lineDeals(lines, { asOf, locationId: connection.location_id, nights, weeks, coupons, freshNights: FRESH_NIGHTS });
        } catch (e) {
          dealError = e instanceof Error ? e.message : "Couldn't read the deal history.";
        }
      }
    } catch (e) {
      priceError = e instanceof Error ? e.message : "Couldn't read the nightly prices.";
    }

    return NextResponse.json({
      store,
      priceError,
      dealError,
      items: items.map((item, i) => {
        const decision = decisions[i];
        // **What you buy** (TEC-131): the item, its amount, the note unless it
        // was only amounts. Display only; the stored line is not rewritten.
        const { quantity: _rule, ...view } = lineView(item, packOf(decision));
        // ★ / ? / + (TEC-135): what Send will do with it, said before Send.
        return { ...item, ...linkFor(item.name, decision, item.note), view, mark: lineMark(decision), price: prices.get(item.id) ?? null, deal: deals.get(item.id) ?? null };
      }),
    });
  } catch (e) {
    return errorResponse(e, "Couldn't read the list.");
  }
}

/** Add lines by hand. One per line of text, which is how a list actually gets typed. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const lines = Array.isArray(body.lines)
    ? body.lines
        .map((l: unknown) => (typeof l === "string" ? l.trim() : ""))
        .filter((l: string) => l.length > 0)
    : [];

  if (lines.length === 0) return NextResponse.json({ error: "Nothing to add." }, { status: 400 });

  try {
    // "Milk — the small tin" is a name and a note; only the name is searched.
    // The cart quantity by the fixed rules (TEC-131): "2 onions" goes in as 2.
    const quantityOf = await quantityRule();
    const items = await addItems(
      lines.map((line: string) => {
        const split = splitLine(line);
        return { ...split, source: "manual" as const, quantity: quantityOf(split) };
      })
    );
    return NextResponse.json({ items }, { status: 201 });
  } catch (e) {
    return errorResponse(e, "Couldn't add that.");
  }
}

/**
 * Tick a line off, or back on.
 *
 * **Ticked is not deleted**, deliberately: the list survives a mis-tap in a shop,
 * and a tidy can leave already-bought lines alone.
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Which line?" }, { status: 400 });

  // How many to put in the cart (TEC-90). Its own field, so a tick never moves it.
  if (body.quantity !== undefined) {
    const quantity = readQuantity(body.quantity);
    if (quantity === null) {
      return NextResponse.json({ error: `How many — a whole number from 1 to ${MAX_QUANTITY}.` }, { status: 400 });
    }
    try {
      await setQuantity(id, quantity);
      return NextResponse.json({ ok: true, quantity });
    } catch (e) {
      return errorResponse(e, "Couldn't change how many.");
    }
  }

  if (typeof body.checked !== "boolean") {
    return NextResponse.json({ error: "Ticked or not ticked?" }, { status: 400 });
  }

  try {
    await setChecked(id, body.checked);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Couldn't tick that off.");
  }
}

/** Remove lines outright — one you typed by mistake, or everything already bought. */
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.filter((i: unknown): i is string => typeof i === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "Which lines?" }, { status: 400 });

  try {
    await removeItems(ids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Couldn't remove those.");
  }
}
