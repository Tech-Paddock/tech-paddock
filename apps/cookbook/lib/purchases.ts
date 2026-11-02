import type { SavedProduct } from "./brands";

/**
 * Import purchases (TEC-213): the pure half. A paste is one JSON object per
 * line; **a bad line is counted and skipped, never guessed**. Matching is by
 * product code first, then by the product's Kroger `description`, and it never
 * adds a name to anything. Format and sample: NOTES.md, *Import purchases*.
 */

export type PurchaseLine = {
  ordered_on: string;
  order_ref: string;
  description: string;
  upc: string | null;
  size: string | null;
  quantity: number;
  price: number | null;
};

export type ReadPurchases = { lines: PurchaseLine[]; skipped: number };

const MAX_SHORT = 40;
const MAX_LONG = 300;

/** Trimmed text, null when absent or empty, undefined when it is not usable text. */
function text(v: unknown, max: number): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim().replace(/\s+/g, " ");
  if (t.length > max) return undefined;
  return t === "" ? null : t;
}

function realDate(s: unknown): string | null {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

/** One line, or null when it is not a purchase this app can trust. */
export function readLine(raw: unknown): PurchaseLine | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const ordered_on = realDate(o.ordered_on);
  const order_ref = text(o.order_ref, MAX_SHORT);
  const description = text(o.description, MAX_LONG);
  const size = text(o.size, MAX_SHORT);
  const upc = text(o.upc, 20);
  if (!ordered_on || !order_ref || !description || size === undefined || upc === undefined) return null;
  if (upc !== null && !/^\d{8,14}$/.test(upc)) return null;
  if (typeof o.quantity !== "number" || !Number.isFinite(o.quantity) || o.quantity <= 0 || o.quantity >= 100000) return null;
  let price: number | null = null;
  if (o.price !== undefined && o.price !== null) {
    if (typeof o.price !== "number" || !Number.isFinite(o.price) || o.price < 0 || o.price >= 1000000) return null;
    price = Math.round(o.price * 100) / 100;
  }
  return { ordered_on, order_ref, description, upc, size, quantity: Math.round(o.quantity * 1000) / 1000, price };
}

/** The pasted text: one JSON object per line. Blank lines are not lines. */
export function parsePurchases(pasted: string): ReadPurchases {
  const lines: PurchaseLine[] = [];
  let skipped = 0;
  for (const row of pasted.split(/\r?\n/)) {
    if (row.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row);
    } catch {
      skipped++;
      continue;
    }
    const line = readLine(parsed);
    if (line) lines.push(line);
    else skipped++;
  }
  return { lines, skipped };
}

/** Words only, lower-case: how a description or size is compared. */
export function plain(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** A line's identity inside its order: the code when shown, else the description, then the size. */
export function lineKey(l: Pick<PurchaseLine, "upc" | "description" | "size">): string {
  const item = l.upc ? `upc:${l.upc.replace(/^0+/, "")}` : `d:${plain(l.description)}`;
  return `${item}|${plain(l.size ?? "")}`;
}

/** The same item twice in one order and size becomes one line with the quantities added. */
export function mergeLines(lines: PurchaseLine[]): PurchaseLine[] {
  const out = new Map<string, PurchaseLine>();
  for (const l of lines) {
    const k = `${l.order_ref}\u0000${lineKey(l)}`;
    const seen = out.get(k);
    if (!seen) out.set(k, { ...l });
    else {
      seen.quantity = Math.round((seen.quantity + l.quantity) * 1000) / 1000;
      if (seen.price === null) seen.price = l.price;
    }
  }
  return [...out.values()];
}

export type Matcher = (l: Pick<PurchaseLine, "upc" | "description">) => string | null;

/**
 * Product code to a saved product first, leading zeros ignored; then the line's
 * description to a saved product's Kroger `description`, as words. **Two products
 * with one code form or description match nothing**: a guess is worse than an
 * unmatched line. Returns the saved product's row `id`, or null.
 */
export function matcher(products: Pick<SavedProduct, "id" | "product_id" | "description">[]): Matcher {
  const byCode = new Map<string, string[]>();
  const byWords = new Map<string, string[]>();
  const add = (m: Map<string, string[]>, k: string, id: string) => m.set(k, [...(m.get(k) ?? []), id]);
  for (const p of products) {
    add(byCode, p.product_id.replace(/^0+/, ""), p.id);
    const w = p.description ? plain(p.description) : "";
    if (w) add(byWords, w, p.id);
  }
  const only = (ids: string[] | undefined) => (ids && ids.length === 1 ? ids[0] : null);
  return (l) => {
    if (l.upc) {
      const hit = only(byCode.get(l.upc.replace(/^0+/, "")));
      if (hit) return hit;
    }
    const w = plain(l.description);
    return w ? only(byWords.get(w)) : null;
  };
}

export type PurchaseRow = PurchaseLine & { line_key: string; product_id: string | null };

export function toRows(lines: PurchaseLine[], match: Matcher): PurchaseRow[] {
  return mergeLines(lines).map((l) => ({ ...l, line_key: lineKey(l), product_id: match(l) }));
}

export type ImportResult = { imported: number; orders: number; matched: number; skipped: number; line: string };

/** "Imported N from M orders · K matched · J skipped". N and K count what was new; M the orders pasted. */
export function summary(imported: number, orders: number, matched: number, skipped: number): ImportResult {
  const line = `Imported ${imported} from ${orders} order${orders === 1 ? "" : "s"} · ${matched} matched · ${skipped} skipped`;
  return { imported, orders, matched, skipped, line };
}

export type Bought = { product_id: string; orders: number; quantity: number; last_ordered_on: string };

/**
 * What TEC-214 reads: per saved product (its row `id`), the distinct orders and
 * the quantity bought in the last `weeks` weeks to `today` (YYYY-MM-DD), and the
 * last order's date. A purchase with no product is left out.
 */
export function tally(
  rows: { product_id: string | null; order_ref: string; ordered_on: string; quantity: number }[],
  weeks: number,
  today: string
): Map<string, Bought> {
  const from = new Date(`${today}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - weeks * 7);
  const since = from.toISOString().slice(0, 10);
  const refs = new Map<string, Set<string>>();
  const out = new Map<string, Bought>();
  for (const r of rows) {
    if (!r.product_id || r.ordered_on < since || r.ordered_on > today) continue;
    const b = out.get(r.product_id) ?? { product_id: r.product_id, orders: 0, quantity: 0, last_ordered_on: r.ordered_on };
    b.quantity = Math.round((b.quantity + Number(r.quantity)) * 1000) / 1000;
    if (r.ordered_on > b.last_ordered_on) b.last_ordered_on = r.ordered_on;
    const set = refs.get(r.product_id) ?? new Set<string>();
    set.add(r.order_ref);
    refs.set(r.product_id, set);
    b.orders = set.size;
    out.set(r.product_id, b);
  }
  return out;
}
