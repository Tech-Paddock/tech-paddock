import type { Modality } from "./modality";

/**
 * What Cookbook sent to the King Soopers cart, and what Clear cart and Back to
 * list say (TEC-228; `RULES.md`, *Send to cart*).
 *
 * **Kroger's Cart API can add and cannot remove.** `cookbook.cart_sends` shows
 * it refused every negative-quantity take-back Cookbook ever sent (TEC-127,
 * TEC-210), so Cookbook never sends one. Clear cart and Back to list change
 * Cookbook's own list only, and their words say the King Soopers cart is not
 * affected. The ledger keeps its old `taken_back` and `refused` rows; nothing
 * writes new ones.
 *
 * No imports but a type, because the browser reads these.
 */

export type SendKind = "sent" | "taken_back" | "refused";

/** One ledger row, as the database holds it. */
export type SendRow = {
  item_id: string | null;
  name: string;
  kind: SendKind;
  upc: string;
  quantity: number;
  modality: Modality | null;
};

/** What Cookbook still has in the cart for one line: one product, one mode. */
export type Held = { upc: string; quantity: number; modality: Modality | null };

function key(upc: string, modality: Modality | null): string {
  return `${upc}|${modality ?? ""}`;
}

/**
 * What is still held per line: the ledger summed by product and mode, **only
 * what is above zero**, in the order each product was first sent.
 */
export function heldByLine(rows: SendRow[]): Map<string, Held[]> {
  const sums = new Map<string, Map<string, Held>>();
  for (const row of rows) {
    if (!row.item_id) continue;
    const line = sums.get(row.item_id) ?? new Map<string, Held>();
    sums.set(row.item_id, line);
    const k = key(row.upc, row.modality);
    const held = line.get(k) ?? { upc: row.upc, quantity: 0, modality: row.modality };
    held.quantity += row.quantity;
    line.set(k, held);
  }
  const out = new Map<string, Held[]>();
  for (const [id, line] of sums) {
    const held = [...line.values()].filter((h) => h.quantity > 0);
    if (held.length > 0) out.set(id, held);
  }
  return out;
}

/** The toast after Clear cart: Cookbook's list only. */
export function clearedWords(n: number): string {
  return `Cleared ${n} from Cookbook. Items in your King Soopers cart are not affected.`;
}

/** The toast after Back to list. */
export const BACK_TO_LIST_WORDS = "Back on the list. Your King Soopers cart is not affected.";
