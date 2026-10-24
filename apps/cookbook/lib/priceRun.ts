import { appToken, productsByIds, type Product } from "./kroger";
import { readConnectionRow } from "./krogerStore";
import { readProducts } from "./productStore";
import { insertNights, insertWeeks, readNightsBetween, readRolledWeeks } from "./priceStore";
import { lookUp, type Lookup } from "./pricing";
import { addDays, denverDate, finishedWeeks } from "./priceDates";
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
 * 2. **Rolls up every finished week that has nightly rows and no roll-up
 *    row** into `price_weeks` (`rollUpWeek`), looking back `CATCH_UP_WEEKS`
 *    (the stoplight's window). Normally that is the week that ended
 *    yesterday, on a Monday; a Monday the cron missed is caught up on the next
 *    run, from the nights that exist (owner's amendment, 2026-10-24). It
 *    reads only stored nights, so it runs even when Kroger failed, and a night
 *    that was missed stays a gap.
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
  /** Each finished week that had nights and no roll-up this run looked at; empty when none. */
  rollup: { week_start: string; rows: number; written: number }[];
};

/** How many finished weeks back a run looks for one that was never rolled up. */
export const CATCH_UP_WEEKS = 12;

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
  /** The Mondays from `from` on that already have a roll-up row. */
  rolledWeeks: (from: string) => Promise<Set<string>>;
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

/**
 * Every finished week in the look-back with no roll-up row, from the nights
 * that exist: one read of their nights, then each week on its own. A week
 * with no nights makes no rows and is looked at again next run, until it ages
 * out. The insert ignores a conflict, so a rerun writes nothing.
 */
async function rollUp(deps: NightDeps, runDate: string): Promise<NightReport["rollup"]> {
  const candidates = finishedWeeks(runDate, CATCH_UP_WEEKS);
  const rolled = await deps.rolledWeeks(candidates[0]);
  const missing = candidates.filter((w) => !rolled.has(w));
  if (missing.length === 0) return [];

  const nights: NightPrice[] = await deps.readNightsBetween(missing[0], addDays(missing[missing.length - 1], 6));
  const out: NightReport["rollup"] = [];
  for (const week of missing) {
    const rows = rollUpWeek(nights, week);
    if (rows.length === 0) continue;
    out.push({ week_start: week, rows: rows.length, written: await deps.insertWeeks(rows) });
  }
  return out;
}

export async function recordNight(deps: NightDeps): Promise<NightReport> {
  const night = denverDate(deps.now());

  let report: Omit<NightReport, "rollup"> | null = null;
  let failure: unknown = null;
  try {
    report = await recordTonight(deps, night);
  } catch (e) {
    failure = e;
  }

  // The roll-up reads stored nights only, so a Kroger outage does not also
  // cost a finished week its summary.
  let rollup: NightReport["rollup"] = [];
  try {
    rollup = await rollUp(deps, night);
  } catch (e) {
    failure ??= e;
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
    rolledWeeks: readRolledWeeks,
  });
}
