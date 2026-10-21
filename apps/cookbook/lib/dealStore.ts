import { getServiceClient } from "./supabase";
import { LookupError } from "./errors";
import type { Deal, ScanRecord, ScanResult, ScanTrigger } from "./pricing";

/**
 * `cookbook.deal_scans` (TEC-121): one row per deal scan, **appended, never
 * updated or deleted** by this app. Reasoning in the
 * `cookbook_deal_scans_and_modality` migration. The list tab shows the latest.
 */

const COLUMNS = "id, ran_at, trigger, location_id, store_name, checked, deals, unpriced, failed";

function hydrate(row: Record<string, unknown>): ScanRecord {
  return {
    id: String(row.id),
    ran_at: String(row.ran_at),
    trigger: row.trigger === "manual" ? "manual" : "opened",
    location_id: String(row.location_id),
    store_name: typeof row.store_name === "string" ? row.store_name : null,
    checked: Number(row.checked) || 0,
    deals: Array.isArray(row.deals) ? (row.deals as Deal[]) : [],
    unpriced: Array.isArray(row.unpriced) ? (row.unpriced as string[]) : [],
    failed: Array.isArray(row.failed) ? (row.failed as ScanResult["failed"]) : [],
  };
}

/** The most recent scan, or null for never. */
export async function readLatestScan(): Promise<ScanRecord | null> {
  const { data, error } = await getServiceClient()
    .from("deal_scans")
    .select(COLUMNS)
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new LookupError(`Couldn't read the last deal scan: ${error.message}`);
  return data ? hydrate(data as Record<string, unknown>) : null;
}

/** Append one scan. An insert, always: an earlier scan is never rewritten. */
export async function appendScan(
  scan: ScanResult & { trigger: ScanTrigger; location_id: string; store_name: string | null }
): Promise<ScanRecord> {
  const { data, error } = await getServiceClient().from("deal_scans").insert(scan).select(COLUMNS).single();
  if (error) throw new LookupError(`Couldn't save the deal scan: ${error.message}`);
  return hydrate(data as Record<string, unknown>);
}
