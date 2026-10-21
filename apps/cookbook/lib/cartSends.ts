import { getServiceClient } from "./supabase";
import { LookupError } from "./errors";
import { isModality } from "./modality";
import type { SendKind, SendRow } from "./takeBack";

/**
 * `cookbook.cart_sends`: what each send put in the King Soopers cart, and what
 * Take back removed (TEC-127). Reasoning in the `cookbook_cart_sends`
 * migration; the rules are `lib/takeBack.ts`.
 *
 * **Rows are only appended.** The one update is `moveSends`, which follows a
 * line through a Tidy; what was sent is never rewritten.
 */

const COLUMNS = "item_id, name, kind, upc, quantity, modality";

export type NewSendRow = { item_id: string; name: string; kind: SendKind; upc: string; quantity: number; modality: string | null };

function hydrate(row: Record<string, unknown>): SendRow {
  return {
    item_id: typeof row.item_id === "string" ? row.item_id : null,
    name: String(row.name ?? ""),
    kind: row.kind as SendKind,
    upc: String(row.upc ?? ""),
    quantity: Number(row.quantity) || 0,
    modality: isModality(row.modality) ? row.modality : null,
  };
}

/** Every row for these list lines. A failed read throws; it never returns "nothing sent". */
export async function readSends(itemIds: string[]): Promise<SendRow[]> {
  if (itemIds.length === 0) return [];
  const { data, error } = await getServiceClient()
    .from("cart_sends")
    .select(COLUMNS)
    .in("item_id", itemIds)
    .order("at", { ascending: true });
  if (error) throw new LookupError(`Couldn't read what was sent to the cart: ${error.message}`);
  return (data ?? []).map((r) => hydrate(r as Record<string, unknown>));
}

export async function appendSends(rows: NewSendRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await getServiceClient().from("cart_sends").insert(rows);
  if (error) throw new LookupError(`Couldn't record what went to the cart: ${error.message}`);
}

/** A Tidy merged these lines into `to`: their sends follow it, so Take back still finds them. */
export async function moveSends(from: string[], to: string): Promise<void> {
  if (from.length === 0) return;
  const { error } = await getServiceClient().from("cart_sends").update({ item_id: to }).in("item_id", from);
  if (error) throw new LookupError(`Couldn't carry what was sent onto the tidied line: ${error.message}`);
}
