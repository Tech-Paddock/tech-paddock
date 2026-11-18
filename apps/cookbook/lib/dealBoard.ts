import { readConnectionRow } from "./krogerStore";
import { readProducts } from "./productStore";
import { readNightSpan, readNightsSince, readWeeksSince } from "./priceStore";
import { readCoupons } from "./couponStore";
import { readLatestScan } from "./dealStore";
import { addDays, denverDate } from "./priceDates";
import { buildDealBoard, type DealBoard } from "./dealRows";
import { HISTORY_WEEKS } from "./stoplight";
import { PICK_WEEKS, purchasesPerProduct } from "./purchaseStore";
import { readSentCodesSince } from "./cartSends";

/**
 * The Deals tab's read (TEC-132): the saved products, their latest nightly
 * prices, their last twelve weeks, the staged coupons and the list tab's latest
 * deal scan, handed to `buildDealBoard` (`lib/dealRows.ts`, pure). **No Kroger
 * call and no model call**: everything shown was recorded by the nightly scan
 * or the existing deal scan. Any failed read throws, so a broken table can
 * never read as "no deals". **The one exception is the purchases read** (the
 * Bought switch, paddock-issues#72): it must not take the board down, so a
 * failure is `boughtIds: null` and the board says `purchasesRead: false`.
 */
async function boughtIds(now: Date): Promise<Set<string> | null> {
  try {
    return new Set((await purchasesPerProduct(PICK_WEEKS, now)).keys());
  } catch {
    return null;
  }
}

/** The codes sent to the cart in the same `PICK_WEEKS` window (`cart_sends`), or null when that read failed. */
async function sentCodes(now: Date): Promise<Set<string> | null> {
  try {
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - PICK_WEEKS * 7);
    return await readSentCodesSince(from.toISOString());
  } catch {
    return null;
  }
}

export async function readDealBoard(now: Date = new Date()): Promise<DealBoard> {
  const asOf = denverDate(now);
  const connection = await readConnectionRow();
  const store = connection?.location_id
    ? { locationId: connection.location_id, name: connection.store_name ?? connection.location_id }
    : null;

  if (!store) {
    const { staged } = await readCoupons();
    return buildDealBoard({ asOf, store: null, products: [], nights: [], weeks: [], coupons: [], couponsStaged: staged, scan: null });
  }

  const [products, nights, weeks, { coupons, staged }, latest, span, bought, sent] = await Promise.all([
    readProducts(),
    // Twelve weeks of nights, not three: Best compares tonight with the lowest night (TEC-196).
    readNightsSince(store.locationId, addDays(asOf, -7 * HISTORY_WEEKS)),
    readWeeksSince(store.locationId, addDays(asOf, -7 * HISTORY_WEEKS)),
    readCoupons(),
    readLatestScan(),
    readNightSpan(store.locationId),
    boughtIds(now),
    sentCodes(now),
  ]);

  return buildDealBoard({
    asOf,
    store,
    products,
    nights,
    weeks,
    coupons,
    couponsStaged: staged,
    span,
    boughtIds: bought,
    sentCodes: sent,
    scan: latest
      ? {
          ranOn: denverDate(new Date(latest.ran_at)),
          locationId: latest.location_id,
          deals: latest.deals.map((d) => ({ productId: d.productId, regular: d.regular, promo: d.promo })),
        }
      : null,
  });
}
