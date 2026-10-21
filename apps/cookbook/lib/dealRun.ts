import { withAccessToken } from "./krogerConnection";
import { productsByIds, topProduct } from "./kroger";
import { readBrandProducts } from "./krogerStore";
import { readPreferences } from "./preferences";
import { readList } from "./grocery";
import { decider } from "./decide";
import { appendScan } from "./dealStore";
import {
  describeEstimate,
  describeScan,
  estimate,
  findDeals,
  lookUp,
  scanEntries,
  targetFor,
  type Estimate,
  type LookupDeps,
  type ScanRecord,
  type ScanTrigger,
} from "./pricing";
import { ConflictError } from "./errors";

/**
 * The deal scan and the estimated total, wired to Kroger and the database
 * (TEC-121). **No model call.** Each borrows one access token
 * (`withAccessToken`), so the list tab runs them one at a time — two at once
 * can race the refresh token's rotation (NOTES.md).
 */

const NEED_STORE = "Pick a store first, so prices are from your King Soopers.";

function lookups(accessToken: string, locationId: string): LookupDeps {
  return {
    byIds: (ids) => productsByIds(accessToken, ids, locationId),
    search: (term) => topProduct(accessToken, term, locationId),
  };
}

async function openLines() {
  return (await readList()).filter((i) => !i.checked);
}

/** One scan of every saved brand and every open line, **appended** to `deal_scans`. */
export async function runDealScan(trigger: ScanTrigger): Promise<{ scan: ScanRecord; message: string }> {
  return withAccessToken(async (accessToken, store) => {
    if (!store) throw new ConflictError(NEED_STORE);
    const [brands, products, open] = await Promise.all([readPreferences(), readBrandProducts(), openLines()]);
    const entries = scanEntries(brands, products, open, decider(brands, products));
    const found = await lookUp(
      entries.map((e) => e.target),
      lookups(accessToken, store.locationId)
    );
    const result = findDeals(entries, found);
    const scan = await appendScan({ ...result, trigger, location_id: store.locationId, store_name: store.name });
    return { scan, message: describeScan(result, store.name) };
  });
}

/** Every open line × its quantity at the store, for the chosen mode. Computed, not stored. */
export async function runEstimate(): Promise<{ estimate: Estimate; message: string }> {
  return withAccessToken(async (accessToken, store, modality) => {
    if (!store) throw new ConflictError(NEED_STORE);
    const [brands, products, open] = await Promise.all([readPreferences(), readBrandProducts(), openLines()]);
    const decide = decider(brands, products);
    const lines = open.map((l) => ({ id: l.id, name: l.name, quantity: l.quantity, target: targetFor(l.name, decide(l.name)) }));
    const found = await lookUp(
      lines.map((l) => l.target),
      lookups(accessToken, store.locationId)
    );
    const result = estimate(lines, found, modality, store.name);
    return { estimate: result, message: describeEstimate(result) };
  });
}
