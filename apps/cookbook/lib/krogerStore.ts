import { getServiceClient } from "./supabase";
import { ConflictError, LookupError } from "./errors";

/**
 * `cookbook.kroger_connection` (the one row) and `cookbook.brand_products`
 * (Kroger's view of each remembered product). Reasoning in the
 * `cookbook_kroger_connection_and_products` migration. Reads and writes only;
 * what the rows mean is `lib/krogerConnection.ts` and `lib/refresh.ts`.
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
};

export async function readConnectionRow(): Promise<ConnectionRow | null> {
  const { data, error } = await getServiceClient()
    .from("kroger_connection")
    .select("refresh_token_sealed, location_id, store_name, connected_at, refreshed_at")
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

export async function writeRefreshedAt(at: string): Promise<void> {
  const { error } = await getServiceClient().from("kroger_connection").update({ refreshed_at: at }).eq("id", true);
  if (error) throw new LookupError(`Couldn't record the refresh: ${error.message}`);
}

export async function deleteConnectionRow(): Promise<void> {
  const { error } = await getServiceClient().from("kroger_connection").delete().eq("id", true);
  if (error) throw new LookupError(`Couldn't disconnect King Soopers: ${error.message}`);
}

// ---------------------------------------------------------------------------
// brand_products
// ---------------------------------------------------------------------------

export type BrandProduct = {
  preference_id: string;
  product_id: string | null;
  description: string | null;
  brand: string | null;
  size: string | null;
  url: string | null;
  price: number | null;
  in_stock: boolean | null;
  missing_since: string | null;
  checked_at: string;
};

const PRODUCT_COLUMNS = "preference_id, product_id, description, brand, size, url, price, in_stock, missing_since, checked_at";

export async function readBrandProducts(): Promise<BrandProduct[]> {
  const { data, error } = await getServiceClient().from("brand_products").select(PRODUCT_COLUMNS);
  if (error) throw new LookupError(`Couldn't read what Kroger last said about your brands: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ...(r as unknown as BrandProduct),
    // numeric comes back as a string from PostgREST.
    price: r.price === null || r.price === undefined ? null : Number(r.price),
  }));
}

export async function writeBrandProduct(row: Omit<BrandProduct, "checked_at"> & { checked_at: string }): Promise<void> {
  const { error } = await getServiceClient().from("brand_products").upsert(row, { onConflict: "preference_id" });
  if (error) throw new LookupError(`Couldn't save what Kroger said: ${error.message}`);
}
