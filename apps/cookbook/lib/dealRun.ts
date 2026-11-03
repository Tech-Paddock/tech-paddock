import { withAccessToken } from "./krogerConnection";
import { productsByIds, topProduct } from "./kroger";
import { readProducts } from "./productStore";
import { purchasesForPicking } from "./purchaseStore";
import { readPreferences } from "./preferences";
import { readList } from "./grocery";
import { decider } from "./decide";
import { appendScan } from "./dealStore";
import {
  describeScan,
  findDeals,
  lookUp,
  scanEntries,
  type LookupDeps,
  type ScanRecord,
  type ScanTrigger,
} from "./pricing";
import { ConflictError } from "./errors";

/**
 * The deal scan, wired to Kroger and the database (TEC-121; the live estimate
 * left in TEC-190). **No model call.** It borrows an access token
 * (`withAccessToken`), so the list tab runs Kroger calls one at a time — two at once
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

/** One scan of every saved product, every search-word phrase and every open line, **appended** to `deal_scans`. */
export async function runDealScan(trigger: ScanTrigger): Promise<{ scan: ScanRecord; message: string }> {
  return withAccessToken(async (accessToken, store) => {
    if (!store) throw new ConflictError(NEED_STORE);
    // The purchases read degrades to an empty map (the count decides), never to a failed scan.
    const [words, products, open, purchases] = await Promise.all([readPreferences(), readProducts(), openLines(), purchasesForPicking()]);
    const entries = scanEntries(products, words, open, decider(products, words, purchases));
    const found = await lookUp(
      entries.map((e) => e.target),
      lookups(accessToken, store.locationId)
    );
    const result = findDeals(entries, found);
    const scan = await appendScan({ ...result, trigger, location_id: store.locationId, store_name: store.name });
    return { scan, message: describeScan(result, store.name) };
  });
}
