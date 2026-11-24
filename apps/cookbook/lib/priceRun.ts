import { appToken, productsByIds, PRODUCTS_PER_REQUEST, type Product } from "./kroger";
import { readConnectionRow } from "./krogerStore";
import { readProducts } from "./productStore";
import { readBoughtItems } from "./purchaseStore";
import { insertNights, insertWeeks, readNightsBetween, readRolledWeeks } from "./priceStore";
import { lookUp, type Lookup } from "./pricing";
import { addDays, denverDate, finishedWeeks } from "./priceDates";
import { rollUpWeek, type NightRow, type NightPrice, type WeekRow } from "./priceWeeks";
import { ConflictError, UpstreamError } from "./errors";
import { codeKey } from "./purchases";
import { tonightsBought } from "./scanRotation";

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
 * **Bought products are scanned too** (paddock-issues#77, owner 2026-11-24:
 * "widen to every item in the database we use to store purchased items"). The
 * distinct product codes in `cookbook.purchases`, all time, that are **not**
 * saved are looked up the same way (`lib/scanRotation.ts` says which ones
 * tonight: all of them while they fit the night's budget, else one fixed slice
 * a night so none is dropped) and recorded in the same table, so Deals can
 * show them. A purchase line with no code is skipped, never guessed. Saved
 * products are looked up first and in full, exactly as before: **a failure of
 * the bought half never costs a saved product its night**.
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
  /** The bought-but-unsaved half (paddock-issues#77). */
  bought: BoughtReport;
  /** Each finished week that had nights and no roll-up this run looked at; empty when none. */
  rollup: { week_start: string; rows: number; written: number }[];
};

export type BoughtReport = {
  /** False when the purchases could not be read; the saved products were still recorded. */
  read: boolean;
  /** Distinct bought codes that are not saved, all time. */
  codes: number;
  /** Nights one full pass takes (1 when every code is looked up every night). */
  nights: number;
  /** Looked up tonight. */
  scanned: number;
  written: number;
  alreadyRecorded: number;
  notReturned: number;
  noPrice: number;
  /** In a batch Kroger refused: no row, tried again on their next night. */
  failed: number;
};

const noBought: BoughtReport = { read: true, codes: 0, nights: 1, scanned: 0, written: 0, alreadyRecorded: 0, notReturned: 0, noPrice: 0, failed: 0 };

/** How many finished weeks back a run looks for one that was never rolled up. */
export const CATCH_UP_WEEKS = 12;

export type NightDeps = {
  now: () => Date;
  /** The chosen store, or null. Reads the connection row; never the token. */
  store: () => Promise<{ locationId: string; name: string } | null>;
  /** Every saved product's code. */
  productCodes: () => Promise<string[]>;
  /** Every distinct code ever bought, as Kroger's 13-digit product ID (`readBoughtItems`), saved or not. */
  boughtCodes: () => Promise<string[]>;
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

/** Bought codes that are not saved (leading zeros ignored), or null when the purchases could not be read. */
async function unsavedBought(deps: NightDeps, saved: string[]): Promise<string[] | null> {
  try {
    const have = new Set(saved.map(codeKey));
    return [...new Set(await deps.boughtCodes())].filter((c) => !have.has(codeKey(c)));
  } catch {
    return null;
  }
}

/** Kroger's answer for tonight's bought codes, fifty a request, four requests at a time. A refused batch is `failed`. */
async function lookUpBought(deps: NightDeps, token: string, locationId: string, codes: string[]) {
  const found = new Map<string, Lookup>();
  const failed = new Set<string>();
  const batches: string[][] = [];
  for (let i = 0; i < codes.length; i += PRODUCTS_PER_REQUEST) batches.push(codes.slice(i, i + PRODUCTS_PER_REQUEST));
  let next = 0;
  async function worker() {
    while (next < batches.length) {
      const batch = batches[next++];
      const got = await lookUp(
        batch.map((productId) => ({ kind: "id" as const, productId })),
        { byIds: (ids) => deps.byIds(token, ids, locationId), search: async () => null }
      );
      for (const code of batch) {
        const one = got.get(`id:${code}`);
        if (!one || one.error) failed.add(code);
        else found.set(`id:${code}`, one);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, batches.length) }, worker));
  return { found, failed };
}

async function recordTonight(deps: NightDeps, night: string): Promise<Omit<NightReport, "rollup">> {
  const store = await deps.store();
  if (!store) throw new ConflictError("Pick a store first, so the nightly prices are from your King Soopers.");
  const codes = [...new Set(await deps.productCodes())];
  const unsaved = await unsavedBought(deps, codes);
  const tonight = tonightsBought(unsaved ?? [], codes.length, night);
  const boughtBase: BoughtReport = { ...noBought, read: unsaved !== null, codes: unsaved?.length ?? 0, nights: tonight.nights, scanned: tonight.codes.length };
  if (codes.length === 0 && tonight.codes.length === 0) {
    return { night, store: store.name, saved: 0, written: 0, alreadyRecorded: 0, notReturned: 0, noPrice: 0, bought: boughtBase };
  }

  const token = await deps.appToken();
  let savedPart = { written: 0, alreadyRecorded: 0, notReturned: 0, noPrice: 0 };
  if (codes.length > 0) {
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
    savedPart = { written, alreadyRecorded: rows.length - written, notReturned, noPrice };
  }

  // The bought half comes after the saved one is safely written, and never fails the run.
  let bought = boughtBase;
  if (tonight.codes.length > 0) {
    const { found, failed } = await lookUpBought(deps, token, store.locationId, tonight.codes);
    const looked = tonight.codes.filter((c) => !failed.has(c));
    const { rows, notReturned, noPrice } = nightRows(looked, found, night, store.locationId);
    try {
      const written = await deps.insertNights(rows);
      bought = { ...boughtBase, written, alreadyRecorded: rows.length - written, notReturned, noPrice, failed: failed.size };
    } catch {
      // The write failed: nothing of the bought half was recorded tonight.
      bought = { ...boughtBase, failed: tonight.codes.length };
    }
  }
  return { night, store: store.name, saved: codes.length, ...savedPart, bought };
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
    boughtCodes: async () => (await readBoughtItems()).map((b) => b.code),
    appToken: () => appToken(),
    byIds: productsByIds,
    insertNights,
    readNightsBetween,
    insertWeeks,
    rolledWeeks: readRolledWeeks,
  });
}
