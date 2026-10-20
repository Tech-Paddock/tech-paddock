import { withAccessToken } from "./krogerConnection";
import { productById } from "./kroger";
import { readBrandProducts, writeBrandProduct, writeRefreshedAt } from "./krogerStore";
import { readPreferences } from "./preferences";
import { describeRefresh, refreshBrands, type RefreshReport } from "./refresh";

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
 * exact-product brand at the chosen store.
 *
 * **`refreshed_at` moves only when the brands were checked.** A refresh that
 * threw — Kroger refused the sign-in, the database did not answer — leaves it,
 * so the next open of the list tab tries again; the route says what failed.
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
    const [brands, cached] = await Promise.all([readPreferences(), readBrandProducts()]);
    const report = await refreshBrands(brands, cached, store.name, {
      lookup: (productId) => productById(accessToken, productId, store.locationId),
      write: writeBrandProduct,
      now: () => new Date().toISOString(),
    });
    const at = new Date().toISOString();
    await writeRefreshedAt(at);
    return { report, message: describeRefresh(report), refreshedAt: at };
  });
}
