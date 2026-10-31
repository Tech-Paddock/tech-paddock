import type { DealBoard, DealRow } from "./dealRows";
import { addDays, mondayOf } from "./priceDates";
import { BEST_MIN_NIGHTS, BEST_WITHIN } from "./bestPrice";
import { HISTORY_WEEKS, MIN_WEEKS } from "./stoplight";

/**
 * What the Deals tab filters on (TEC-132): search, aisle, All · On sale ·
 * Coupon · Stacks · Best, and Green · Neutral · Red. **Pure and type-only imports**,
 * because the browser runs it (`lib/dealRows.ts` pulls in server code).
 *
 * The colour filter is by light: a product that is **new** (under four weeks
 * of history) has no colour yet, so it shows under Any and under New only.
 */

export type Kind = "all" | "sale" | "coupon" | "stack" | "best";
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
  if (f.kind === "best" && !row.best.qualifies) return false;
  if (f.light !== "any" && row.light !== f.light) return false;
  return true;
}

/** The rows that pass, grouped by aisle in the order the board gave them. */
export function groupByAisle(rows: DealRow[]): { aisle: string; rows: DealRow[] }[] {
  const groups = new Map<string, DealRow[]>();
  for (const r of rows) groups.set(r.aisle, [...(groups.get(r.aisle) ?? []), r]);
  return [...groups].map(([aisle, list]) => ({ aisle, rows: list }));
}

// ---------------------------------------------------------------------------
// Why a filter is empty (TEC-190)
// ---------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 23" from `YYYY-MM-DD`. */
export function shortDay(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${MONTHS[Number(m[1]) - 1]} ${Number(m[2])}` : iso;
}

/**
 * About when colours begin: the Monday roll-up adds one week of history per
 * run, so with `weeksHeld` weeks rolled up the stoplight (`MIN_WEEKS` weeks)
 * can colour a product on the run that adds the last missing one. `asOf` is
 * today's Denver date; a Monday's run has already happened by the time anyone
 * reads it, so the next one is the Monday after. Already coloured: `asOf`.
 */
export function coloursFrom(asOf: string, weeksHeld: number): string {
  const missing = MIN_WEEKS - weeksHeld;
  if (missing <= 0) return asOf;
  return addDays(addDays(mondayOf(asOf), 7), 7 * (missing - 1));
}

const LIGHT_WORD: Record<LightFilter, string> = { any: "", green: "green", neutral: "neutral", red: "red", new: "new" };

/**
 * What an empty Deals list says. **Each empty filter says why**, not "No deals
 * match" for everything: the colours cannot appear before four weeks of
 * nightly prices exist (`stoplight`), which is the case while the history is
 * still building. `offerNew` asks the screen for a one-tap switch to New.
 */
export function emptyMessage(board: DealBoard, f: DealFilter): { title: string; body: string; offerNew: boolean } {
  const coloured = f.light === "green" || f.light === "neutral" || f.light === "red";
  if (!board.store) {
    return { title: "No store picked", body: "Pick a store on the Grocery list first, so prices are from your King Soopers.", offerNew: false };
  }
  if ((f.kind === "coupon" || f.kind === "stack") && !board.couponsStaged) {
    return { title: "No coupons staged yet", body: "Coupons come only from your own Chrome task, once it has run.", offerNew: false };
  }
  if (board.rows.length === 0) {
    return board.hasNights
      ? { title: "No recent prices", body: "None of your saved products has a price from the last few nights.", offerNew: false }
      : { title: "No prices yet", body: "The nightly check runs about 3 a.m. Denver time; the first one fills this in.", offerNew: false };
  }
  if (f.kind === "best" && f.light === "any") return bestEmpty(board);
  if (coloured && board.weeksHeld < MIN_WEEKS) {
    return {
      title: `No ${LIGHT_WORD[f.light]} deals yet`,
      body: `Colours compare today's price with each product's last ${HISTORY_WEEKS} weeks, and start after ${MIN_WEEKS} weeks of prices: about ${shortDay(coloursFrom(board.asOf, board.weeksHeld))}. Until then every product is New.`,
      offerNew: true,
    };
  }
  if (coloured) {
    return { title: `Nothing is ${LIGHT_WORD[f.light]} right now`, body: "Try Any, or clear the search and pick All aisles.", offerNew: false };
  }
  if (f.light === "new") {
    return { title: "Nothing is new", body: `Every product has ${MIN_WEEKS} or more weeks of history, so each has a colour.`, offerNew: false };
  }
  if (f.kind === "sale") {
    return { title: "Nothing is on sale", body: "No saved product was on sale in the latest nightly prices. Try All.", offerNew: false };
  }
  return { title: "No deals match", body: "Clear the search, or pick All aisles.", offerNew: false };
}

/**
 * Why Best is empty (TEC-196): either no product has the `BEST_MIN_NIGHTS`
 * nights it takes to say, or none is at its low right now. Says which.
 */
function bestEmpty(board: DealBoard): { title: string; body: string; offerNew: boolean } {
  if (board.nightsHeld < BEST_MIN_NIGHTS) {
    return {
      title: "No best deals yet",
      body: `Best needs at least ${BEST_MIN_NIGHTS} nights of prices for a product to know its low. The nightly check adds one a night, about 3 a.m. Denver time.`,
      offerNew: false,
    };
  }
  return {
    title: "Nothing is at its low right now",
    body: `Best is today's price at, or within ${Math.round(BEST_WITHIN * 100)}% of, a product's lowest night in the last ${HISTORY_WEEKS} weeks. Try All, or clear the search and pick All aisles.`,
    offerNew: false,
  };
}
