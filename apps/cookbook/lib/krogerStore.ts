import { getServiceClient } from "./supabase";
import { ConflictError, LookupError } from "./errors";
import type { Modality } from "./modality";

/**
 * `cookbook.kroger_connection` (the one row). Reasoning in the
 * `cookbook_kroger_connection_and_products` migration. Reads and writes only;
 * what the row means is `lib/krogerConnection.ts`. `cookbook.brand_products`
 * is no longer read or written (TEC-131): what Kroger says about a saved
 * product lives on its row in `cookbook.products` (`lib/productStore.ts`).
 *
 * **The token column holds the sealed form and nothing else**, and the table
 * refuses a value without the `v1:` prefix. This file never sees plaintext.
 */

export type ConnectionRow = {
  refresh_token_sealed: string;
  location_id: string | null;
  store_name: string | null;
  connected_at: string;
  refreshed_at: string | null;
  /** PICKUP or DELIVERY (TEC-121; the `cookbook_deal_scans_and_modality` migration). */
  modality: string | null;
};

export async function readConnectionRow(): Promise<ConnectionRow | null> {
  const { data, error } = await getServiceClient()
    .from("kroger_connection")
    .select("refresh_token_sealed, location_id, store_name, connected_at, refreshed_at, modality")
    .maybeSingle();
  if (error) throw new LookupError(`Couldn't read the King Soopers connection: ${error.message}`);
  return (data as ConnectionRow | null) ?? null;
}

/**
 * Store a sealed refresh token. **A reconnect keeps the chosen store** — only
 * the token columns are written — and `connected_at` moves only when `fresh`.
 */
export async function writeRefreshToken(sealed: string, fresh: boolean): Promise<void> {
  const now = new Date().toISOString();
  const row: Record<string, unknown> = { id: true, refresh_token_sealed: sealed, updated_at: now };
  if (fresh) row.connected_at = now;
  const { error } = await getServiceClient().from("kroger_connection").upsert(row, { onConflict: "id" });
  if (error) throw new LookupError(`Couldn't save the King Soopers connection: ${error.message}`);
}

export async function writeStore(locationId: string, storeName: string): Promise<void> {
  const { data, error } = await getServiceClient()
    .from("kroger_connection")
    .update({ location_id: locationId, store_name: storeName, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("id");
  if (error) throw new LookupError(`Couldn't save the store: ${error.message}`);
  if (!data || data.length === 0) throw new ConflictError("Connect King Soopers before picking a store.");
}

/** Pickup or Delivery, remembered on the connection. The column's check refuses anything else. */
export async function writeModality(modality: Modality): Promise<void> {
  const { data, error } = await getServiceClient()
    .from("kroger_connection")
    .update({ modality, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("id");
  if (error) throw new LookupError(`Couldn't save pickup or delivery: ${error.message}`);
  if (!data || data.length === 0) throw new ConflictError("Connect King Soopers before choosing pickup or delivery.");
}

export async function writeRefreshedAt(at: string): Promise<void> {
  const { error } = await getServiceClient().from("kroger_connection").update({ refreshed_at: at }).eq("id", true);
  if (error) throw new LookupError(`Couldn't record the refresh: ${error.message}`);
}

export async function deleteConnectionRow(): Promise<void> {
  const { error } = await getServiceClient().from("kroger_connection").delete().eq("id", true);
  if (error) throw new LookupError(`Couldn't disconnect King Soopers: ${error.message}`);
}
