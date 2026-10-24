import type { DealRow } from "./dealRows";

/**
 * What the Deals tab filters on (TEC-132): search, aisle, All · On sale ·
 * Coupon · Stacks, and Green · Neutral · Red. **Pure and type-only imports**,
 * because the browser runs it (`lib/dealRows.ts` pulls in server code).
 *
 * The colour filter is by light: a product that is **new** (under four weeks
 * of history) has no colour yet, so it shows under Any and under New only.
 */

export type Kind = "all" | "sale" | "coupon" | "stack";
export type LightFilter = "any" | "green" | "neutral" | "red" | "new";

export type DealFilter = { query: string; kind: Kind; aisle: string; light: LightFilter };

/** The aisle that means every aisle. */
export const ALL_AISLES = "All";

export const NO_FILTER: DealFilter = { query: "", kind: "all", aisle: ALL_AISLES, light: "any" };

export function matchesFilter(row: DealRow, f: DealFilter): boolean {
  const q = f.query.trim().toLowerCase();
  if (q && !row.name.toLowerCase().includes(q)) return false;
  if (f.aisle !== ALL_AISLES && row.aisle !== f.aisle) return false;
  if (f.kind === "sale" && !row.onSale) return false;
  if (f.kind === "coupon" && row.coupons.length === 0) return false;
  if (f.kind === "stack" && !row.stacks) return false;
  if (f.light !== "any" && row.light !== f.light) return false;
  return true;
}

/** The rows that pass, grouped by aisle in the order the board gave them. */
export function groupByAisle(rows: DealRow[]): { aisle: string; rows: DealRow[] }[] {
  const groups = new Map<string, DealRow[]>();
  for (const r of rows) groups.set(r.aisle, [...(groups.get(r.aisle) ?? []), r]);
  return [...groups].map(([aisle, list]) => ({ aisle, rows: list }));
}
