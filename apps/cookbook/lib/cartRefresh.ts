import { heldByLine, type Held, type SendRow } from "./takeBack";
import type { Product } from "./kroger";
import { ConflictError } from "./errors";

/**
 * **Refresh cart** (TEC-206; owner, 2026-11-02: "We should operate as if the
 * king soopers app is only used to checkout. All adds come from this app.").
 *
 * In cart is treated as the whole King Soopers cart, so the ledger
 * (`cart_sends`) is the truth about it. A refresh:
 *
 * 1. **Fixes In cart from the ledger.** A line the ledger holds product for is
 *    marked sent; a line marked sent whose ledger nets to nothing (everything
 *    taken back) is returned to the List. A sent line with *no ledger rows at
 *    all* (sent before the ledger existed) is left as it is and reads "no
 *    price", because there is nothing to price it by.
 * 2. **Prices today's cart** from Kroger's product read at the chosen store,
 *    with the app's own token (`appToken`, product read), **never the owner's
 *    account token**. A line Kroger can't price reads "no price" and is never
 *    counted as $0.
 *
 * Pure, with the database and Kroger passed in. No model runs.
 */

export type CartListLine = { id: string; name: string; sent_at: string | null };

/** What the ledger says should change on the list. */
export type Fix = { markSent: string[]; markUnsent: string[] };

/** Compare the list with the ledger. Rows for lines no longer on the list (`item_id` null) are ignored. */
export function reconcile(list: CartListLine[], rows: SendRow[]): Fix & { held: Map<string, Held[]> } {
  const held = heldByLine(rows);
  const recorded = new Set(rows.flatMap((r) => (r.item_id ? [r.item_id] : [])));
  const markSent: string[] = [];
  const markUnsent: string[] = [];
  for (const line of list) {
    const holds = (held.get(line.id)?.length ?? 0) > 0;
    if (holds && line.sent_at === null) markSent.push(line.id);
    if (!holds && line.sent_at !== null && recorded.has(line.id)) markUnsent.push(line.id);
  }
  return { markSent, markUnsent, held };
}

export type CartLinePrice = {
  id: string;
  /** What Kroger calls the product that is in the cart, when it returned one. */
  product: string | null;
  size: string | null;
  /** Today's shelf price times what is held, or null for "no price". Never 0. */
  total: number | null;
  onSale: boolean;
};

export type CartRefresh = {
  checkedAt: string;
  store: string;
  /** Lines the ledger put back in the cart / took out of it. */
  fixed: { added: number; removed: number };
  lines: CartLinePrice[];
  /** The sum of the priced lines, or null when none could be priced. */
  total: number | null;
  /** Lines in the cart Kroger couldn't price. */
  unpriced: number;
};

/** One line's price from what it holds and Kroger's answers. Any product with no price makes the line "no price". */
export function priceHeld(id: string, held: Held[], found: Map<string, Product>): CartLinePrice {
  if (held.length === 0) return { id, product: null, size: null, total: null, onSale: false };
  let total = 0;
  let onSale = false;
  for (const h of held) {
    const p = found.get(h.upc);
    if (!p || p.price === null) return { id, product: p?.description ?? null, size: p?.size ?? null, total: null, onSale: false };
    total += p.price * h.quantity;
    if (p.promo !== null && p.regular !== null && p.promo < p.regular) onSale = true;
  }
  const first = found.get(held[0].upc);
  return { id, product: first?.description ?? null, size: first?.size ?? null, total: Math.round(total * 100) / 100, onSale };
}

export type CartRefreshDeps = {
  now: () => Date;
  readList: () => Promise<CartListLine[]>;
  readSends: (ids: string[]) => Promise<SendRow[]>;
  markSent: (ids: string[], at: string) => Promise<void>;
  markUnsent: (ids: string[]) => Promise<void>;
  /** The chosen store, or null. */
  store: () => Promise<{ locationId: string; name: string } | null>;
  /** The app's own Kroger token; product read only. */
  appToken: () => Promise<string>;
  byIds: (accessToken: string, ids: string[], locationId: string) => Promise<Product[]>;
};

export async function refreshCart(deps: CartRefreshDeps): Promise<CartRefresh> {
  const store = await deps.store();
  if (!store) throw new ConflictError("Pick a store first, so the cart is priced at your King Soopers.");
  const at = deps.now();
  const list = await deps.readList();
  const rows = await deps.readSends(list.map((l) => l.id));
  const fix = reconcile(list, rows);

  // The ledger is written to the list before Kroger is asked, so a price lookup that fails still leaves In cart right.
  if (fix.markSent.length > 0) await deps.markSent(fix.markSent, at.toISOString());
  if (fix.markUnsent.length > 0) await deps.markUnsent(fix.markUnsent);

  const inCart = list.filter((l) => (fix.held.get(l.id)?.length ?? 0) > 0 || (l.sent_at !== null && !fix.markUnsent.includes(l.id)));
  const upcs = [...new Set(inCart.flatMap((l) => (fix.held.get(l.id) ?? []).map((h) => h.upc)))];
  const found = new Map<string, Product>();
  if (upcs.length > 0) {
    const token = await deps.appToken();
    for (const p of await deps.byIds(token, upcs, store.locationId)) {
      found.set(p.upc, p);
      found.set(p.productId, p);
    }
  }

  const lines = inCart.map((l) => priceHeld(l.id, fix.held.get(l.id) ?? [], found));
  const priced = lines.filter((l) => l.total !== null);
  return {
    checkedAt: at.toISOString(),
    store: store.name,
    fixed: { added: fix.markSent.length, removed: fix.markUnsent.length },
    lines,
    total: priced.length === 0 ? null : Math.round(priced.reduce((sum, l) => sum + (l.total as number), 0) * 100) / 100,
    unpriced: lines.length - priced.length,
  };
}
