import { appToken, productsByIds, type Product } from "./kroger";
import { readConnectionRow } from "./krogerStore";
import { readProducts } from "./productStore";
import { insertNights, insertWeeks, readNightsBetween } from "./priceStore";
import { lookUp, type Lookup } from "./pricing";
import { addDays, denverDate, weekToRollUp } from "./priceDates";
import { rollUpWeek, type NightRow, type NightPrice, type WeekRow } from "./priceWeeks";
import { ConflictError, UpstreamError } from "./errors";

/**
 * The nightly price scan (TEC-132), run by Vercel Cron through
 * `/api/cron/prices`. **No model call, and no account token**: Kroger's
 * client-credentials token (`appToken`, product read) is the only sign-in,
 * and the connection row is read only for the chosen store.
 *
 * What it does, in order:
 *
 * 1. **Records the night**: every saved product's regular price, sale price,
 *    stock and aisle at the chosen store, one row each, insert only. Products
 *    go to Kroger by code in batches (`productsByIds`, fifty a request, the
 *    same lookup the deal scan uses). A product Kroger does not return, or
 *    returns with no price, gets **no row**: a gap is a gap, never a zero and
 *    never backfilled.
 * 2. **On a Monday, rolls up the week that just ended** into
 *    `price_weeks` (`rollUpWeek`). It does this even when Kroger failed that
 *    night, since it reads only the stored nights.
 *
 * **A rerun the same night is a no-op**: both inserts ignore a conflict, so
 * the first reading stands and the report says how many rows were new.
 */

export type NightReport = {
  /** The Denver date recorded. */
  night: string;
  store: string;
  /** Saved products looked up. */
  saved: number;
  /** Rows written now. */
  written: number;
  /** Rows the night already had (a rerun). */
  alreadyRecorded: number;
  /** Kroger did not return these at the store. */
  notReturned: number;
  /** Kroger returned these with no price. */
  noPrice: number;
  /** Set only on a Monday: the week rolled up. */
  rollup: { week_start: string; rows: number; written: number } | null;
};

export type NightDeps = {
  now: () => Date;
  /** The chosen store, or null. Reads the connection row; never the token. */
  store: () => Promise<{ locationId: string; name: string } | null>;
  /** Every saved product's code. */
  productCodes: () => Promise<string[]>;
  /** The app's own Kroger token. */
  appToken: () => Promise<string>;
  /** Kroger's products at the store, by code (batched inside). */
  byIds: (accessToken: string, ids: string[], locationId: string) => Promise<Product[]>;
  insertNights: (rows: NightRow[]) => Promise<number>;
  readNightsBetween: (from: string, to: string) => Promise<NightRow[]>;
  insertWeeks: (rows: WeekRow[]) => Promise<number>;
};

/** One night's rows from what Kroger said, and what had no row and why. */
export function nightRows(
  codes: string[],
  found: Map<string, Lookup>,
  night: string,
  locationId: string
): { rows: NightRow[]; notReturned: number; noPrice: number } {
  const rows: NightRow[] = [];
  let notReturned = 0;
  let noPrice = 0;
  for (const code of codes) {
    const product = found.get(`id:${code}`)?.product ?? null;
    if (!product) {
      notReturned += 1;
      continue;
    }
    if (product.regular === null && product.promo === null) {
      noPrice += 1;
      continue;
    }
    rows.push({
      product_id: code,
      location_id: locationId,
      night,
      regular: product.regular,
      sale: product.promo,
      in_stock: product.inStock,
      aisle: product.aisle,
    });
  }
  return { rows, notReturned, noPrice };
}

async function recordTonight(deps: NightDeps, night: string): Promise<Omit<NightReport, "rollup">> {
  const store = await deps.store();
  if (!store) throw new ConflictError("Pick a store first, so the nightly prices are from your King Soopers.");
  const codes = [...new Set(await deps.productCodes())];
  if (codes.length === 0) {
    return { night, store: store.name, saved: 0, written: 0, alreadyRecorded: 0, notReturned: 0, noPrice: 0 };
  }

  const token = await deps.appToken();
  const found = await lookUp(
    codes.map((productId) => ({ kind: "id" as const, productId })),
    { byIds: (ids) => deps.byIds(token, ids, store.locationId), search: async () => null }
  );
  // A batch that failed fails every code in it; with nothing read there is no
  // night to record, and the cron should show as failed rather than empty.
  const failure = [...found.values()].find((l) => l.error)?.error;
  if (failure) throw new UpstreamError(failure);

  const { rows, notReturned, noPrice } = nightRows(codes, found, night, store.locationId);
  const written = await deps.insertNights(rows);
  return { night, store: store.name, saved: codes.length, written, alreadyRecorded: rows.length - written, notReturned, noPrice };
}

async function rollUp(deps: NightDeps, weekStart: string): Promise<NonNullable<NightReport["rollup"]>> {
  const nights: NightPrice[] = await deps.readNightsBetween(weekStart, addDays(weekStart, 6));
  const rows = rollUpWeek(nights, weekStart);
  return { week_start: weekStart, rows: rows.length, written: await deps.insertWeeks(rows) };
}

export async function recordNight(deps: NightDeps): Promise<NightReport> {
  const night = denverDate(deps.now());
  const weekStart = weekToRollUp(night);

  let report: Omit<NightReport, "rollup"> | null = null;
  let failure: unknown = null;
  try {
    report = await recordTonight(deps, night);
  } catch (e) {
    failure = e;
  }

  // The roll-up reads stored nights only, so a Kroger outage on a Monday does
  // not also cost the week its summary.
  let rollup: NightReport["rollup"] = null;
  if (weekStart) {
    try {
      rollup = await rollUp(deps, weekStart);
    } catch (e) {
      failure ??= e;
    }
  }

  if (failure || !report) throw failure;
  return { ...report, rollup };
}

/** The real wiring: Kroger's app token, the chosen store, the saved products, the tables. */
export function runPriceNight(): Promise<NightReport> {
  return recordNight({
    now: () => new Date(),
    store: async () => {
      const row = await readConnectionRow();
      return row?.location_id ? { locationId: row.location_id, name: row.store_name ?? row.location_id } : null;
    },
    productCodes: async () => (await readProducts()).map((p) => p.product_id),
    appToken: () => appToken(),
    byIds: productsByIds,
    insertNights,
    readNightsBetween,
    insertWeeks,
  });
}
