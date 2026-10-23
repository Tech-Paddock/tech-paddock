import { withAccessToken } from "./krogerConnection";
import { productsByIds, searchProducts } from "./kroger";
import { writeRefreshedAt } from "./krogerStore";
import { readProducts, writeCache } from "./productStore";
import { readPreferences } from "./preferences";
import { describeRefresh, refreshProducts, type RefreshReport } from "./refresh";

export type RefreshResult = {
  /** Null when no store is chosen yet: the token was renewed and nothing else could be checked. */
  report: RefreshReport | null;
  /** The whole result in words, for the list tab. */
  message: string;
  refreshedAt: string | null;
};

/**
 * One refresh: renew the Kroger sign-in (`withAccessToken` turns the refresh
 * token over, which is what keeps an idle connection alive), then check every
 * saved product at the chosen store (TEC-131: one batched lookup, then a
 * successor search for each one Kroger no longer returns).
 *
 * **`refreshed_at` moves only when the products were checked.** A refresh that
 * threw leaves it, so the next open of the list tab tries again.
 */
export async function runRefresh(): Promise<RefreshResult> {
  return withAccessToken(async (accessToken, store) => {
    if (!store) {
      return {
        report: null,
        message: "King Soopers sign-in renewed. Pick a store to check prices and stock.",
        refreshedAt: null,
      };
    }
    const [products, words] = await Promise.all([readProducts(), readPreferences()]);
    const report = await refreshProducts(products, words.length, store.name, {
      byIds: (ids) => productsByIds(accessToken, ids, store.locationId),
      search: (term) => searchProducts(accessToken, term, store.locationId, 10),
      write: writeCache,
      now: () => new Date().toISOString(),
    });
    const at = new Date().toISOString();
    await writeRefreshedAt(at);
    return { report, message: describeRefresh(report), refreshedAt: at };
  });
}
