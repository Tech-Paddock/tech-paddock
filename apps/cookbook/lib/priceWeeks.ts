import { addDays } from "./priceDates";

/**
 * The Monday roll-up (TEC-132): one week of a product's nightly rows becomes
 * one row of low, high, mean, regular mean, nights on sale and nights seen.
 *
 * **Pure.** `lib/priceRun.ts` reads the nights and writes what this returns.
 * Every figure is over the **effective price** of a night (the sale if there
 * is one, else the regular), except the regular mean. A week with gaps is
 * averaged over the nights that exist; **a missing night is never filled in**.
 * The reasoning is in the `cookbook_price_weeks` migration.
 */

export type NightPrice = {
  product_id: string;
  location_id: string;
  /** The Denver date of the run, `YYYY-MM-DD`. */
  night: string;
  regular: number | null;
  sale: number | null;
};

/** A night as the table holds it: the price, plus stock and the aisle. */
export type NightRow = NightPrice & {
  in_stock: boolean | null;
  aisle: string | null;
};

export type WeekRow = {
  product_id: string;
  location_id: string;
  /** The Monday. */
  week_start: string;
  low: number;
  high: number;
  mean: number;
  regular_mean: number | null;
  nights_on_sale: number;
  nights_seen: number;
};

/** The sale if there is one, else the regular, else null. */
export function effectivePrice(n: Pick<NightPrice, "regular" | "sale">): number | null {
  return n.sale ?? n.regular ?? null;
}

/** A night on sale: a sale price below the regular, or a sale price with no regular given. */
export function nightOnSale(n: Pick<NightPrice, "regular" | "sale">): boolean {
  return n.sale !== null && (n.regular === null || n.sale < n.regular);
}

/** Four places: what the `mean` columns hold, so a mean is rounded once. */
const round4 = (x: number) => Math.round(x * 10_000) / 10_000;
const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * One row per product and store for the week starting `weekStart` (a Monday):
 * only nights dated `weekStart` through the Sunday count, so a stray row from
 * another week cannot leak in. A product with no priced night that week gets
 * no row. Rows come back ordered by store, then product, so a run is stable.
 */
export function rollUpWeek(nights: NightPrice[], weekStart: string): WeekRow[] {
  const last = addDays(weekStart, 6);
  const groups = new Map<string, NightPrice[]>();
  for (const n of nights) {
    if (n.night < weekStart || n.night > last) continue;
    if (effectivePrice(n) === null) continue;
    const key = `${n.location_id}|${n.product_id}`;
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }

  const rows: WeekRow[] = [];
  for (const key of [...groups.keys()].sort()) {
    const group = groups.get(key) as NightPrice[];
    // One reading per night: the table is unique on it, but this is a pure
    // function and a repeated night must not count twice.
    const byNight = new Map(group.map((n) => [n.night, n] as const));
    const seen = [...byNight.values()];
    const prices = seen.map((n) => effectivePrice(n) as number);
    const regulars = seen.flatMap((n) => (n.regular === null ? [] : [n.regular]));
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    rows.push({
      product_id: seen[0].product_id,
      location_id: seen[0].location_id,
      week_start: weekStart,
      low: round2(Math.min(...prices)),
      high: round2(Math.max(...prices)),
      mean: round4(mean),
      regular_mean: regulars.length === 0 ? null : round4(regulars.reduce((a, b) => a + b, 0) / regulars.length),
      nights_on_sale: seen.filter(nightOnSale).length,
      nights_seen: seen.length,
    });
  }
  return rows;
}
