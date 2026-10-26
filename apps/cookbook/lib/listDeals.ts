import { mentions, normalizeName } from "./brands";
import { itemInName, itemWords } from "./itemWords";
import type { DealRow } from "./dealRows";

/**
 * "On my list" on the Deals tab (TEC-132): the board's rows that match an open
 * shopping-list line. **Pure, and no request of its own**: it takes the rows
 * `/api/deals` already returned and the open lines the list tab already read,
 * so there is no Kroger call and no extra read per render. Type-only imports
 * from the board, because the browser runs it.
 *
 * **It matches the way the list matches products** (`decide`, `lib/brands.ts`):
 * 1. a line that is a product code is that product;
 * 2. else a saved name that appears in the line as whole words, the longest
 *    name winning, so `whole milk` beats `milk`;
 * 3. only when no name matched, the line's item alone (`lib/itemWords.ts`)
 *    against the product's official Kroger name.
 *
 * The edge: `decide` weighs every saved product, and this weighs only the rows
 * on the board, so a longer name on a product with no recent price cannot
 * outrank a shorter one here.
 *
 * **A deal is a sale, a staged coupon, or a green light.** A row that matches
 * a line but is none of those is just a priced product, not a deal, and is not
 * listed.
 */

export type ListDeal = { row: DealRow; lines: string[] };

export function isDeal(row: DealRow): boolean {
  return row.onSale || row.coupons.length > 0 || row.light === "green";
}

/** How long the longest saved name of `row` found in `line` is, or 0. */
function nameMatch(line: string, row: DealRow): number {
  let best = 0;
  for (const name of row.names) {
    const n = normalizeName(name);
    if (n.length > best && mentions(line, n)) best = n.length;
  }
  return best;
}

/** The rows a single list line finds on the board, deals or not. */
export function rowsForLine(line: string, rows: DealRow[]): DealRow[] {
  const text = line.trim();
  if (/^\d{8,14}$/.test(text)) return rows.filter((r) => r.productId === text);

  let best = 0;
  let hits: DealRow[] = [];
  for (const r of rows) {
    const length = nameMatch(text, r);
    if (length === 0) continue;
    if (length > best) {
      best = length;
      hits = [r];
    } else if (length === best) {
      hits.push(r);
    }
  }
  if (hits.length > 0) return hits;

  const item = itemWords(text);
  return item ? rows.filter((r) => itemInName(item, r.name)) : [];
}

/**
 * The deals among the board's rows that an open line finds, each with the
 * lines that found it. Best first: stacks, then green, then the bigger
 * percentage off, then by name.
 */
export function listDeals(rows: DealRow[], openLines: string[]): ListDeal[] {
  const found = new Map<string, ListDeal>();
  for (const line of openLines) {
    for (const row of rowsForLine(line, rows)) {
      if (!isDeal(row)) continue;
      const seen = found.get(row.productId);
      if (!seen) found.set(row.productId, { row, lines: [line.trim()] });
      else if (!seen.lines.includes(line.trim())) seen.lines.push(line.trim());
    }
  }
  const rank = (d: ListDeal) => (d.row.stacks ? 2 : 0) + (d.row.light === "green" ? 1 : 0);
  return [...found.values()].sort(
    (a, b) => rank(b) - rank(a) || (b.row.percentOff ?? 0) - (a.row.percentOff ?? 0) || a.row.name.localeCompare(b.row.name)
  );
}
