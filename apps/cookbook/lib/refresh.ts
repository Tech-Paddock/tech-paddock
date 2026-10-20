import { productIdFromUrl } from "./kingsoopers";
import type { Product } from "./kroger";

/**
 * Refresh — what Kroger says now about every remembered product
 * (2026-10-20). **No model call.** For each *this exact product* brand at the
 * chosen store: price and stock, a product number and page filled in from a
 * brand that only had a link, and **a product Kroger no longer returns is
 * flagged, never dropped** — the brand was Joel's choice, and the replacement
 * is his to make in Your brands.
 *
 * Pure, with Kroger and the database passed in; `runRefresh` in
 * `lib/refreshRun.ts` supplies them, and refreshing the token happens there.
 */

export type RefreshBrand = { id: string; phrase: string; kind: "product" | "terms" | "plain"; url: string | null };

export type CachedProduct = {
  preference_id: string;
  product_id: string | null;
  description: string | null;
  brand: string | null;
  size: string | null;
  url: string | null;
  price: number | null;
  in_stock: boolean | null;
  missing_since: string | null;
};

export type RefreshReport = {
  store: string | null;
  updated: string[];
  flagged: string[];
  failed: { phrase: string; reason: string }[];
  /** Search-word brands: there is no one product to check. */
  searchWords: number;
};

export type RefreshDeps = {
  lookup: (productId: string) => Promise<Product | null>;
  write: (row: CachedProduct & { checked_at: string }) => Promise<void>;
  now: () => string;
};

export async function refreshBrands(
  brands: RefreshBrand[],
  cached: CachedProduct[],
  store: string | null,
  deps: RefreshDeps
): Promise<RefreshReport> {
  const report: RefreshReport = { store, updated: [], flagged: [], failed: [], searchWords: 0 };
  const byId = new Map(cached.map((c) => [c.preference_id, c]));

  for (const brand of brands) {
    if (brand.kind !== "product") {
      report.searchWords++;
      continue;
    }
    const before = byId.get(brand.id) ?? null;
    const productId = (brand.url ? productIdFromUrl(brand.url) : null) ?? before?.product_id ?? null;
    if (!productId) {
      report.failed.push({ phrase: brand.phrase, reason: "its link carries no product number — paste the product page again" });
      continue;
    }

    let product: Product | null;
    try {
      product = await deps.lookup(productId);
    } catch (e) {
      report.failed.push({ phrase: brand.phrase, reason: e instanceof Error ? e.message : "Kroger's lookup failed" });
      continue;
    }

    const checked_at = deps.now();
    const row: CachedProduct & { checked_at: string } = product
      ? {
          preference_id: brand.id,
          product_id: product.productId,
          description: product.description,
          brand: product.brand,
          size: product.size,
          url: product.url,
          price: product.price,
          in_stock: product.inStock,
          missing_since: null,
          checked_at,
        }
      : {
          // **Flagged and kept.** What was known before stays, so Your brands
          // can still say what the product was; the first time it went
          // missing is kept rather than moved forward on every refresh.
          preference_id: brand.id,
          product_id: productId,
          description: before?.description ?? null,
          brand: before?.brand ?? null,
          size: before?.size ?? null,
          url: before?.url ?? brand.url,
          price: null,
          in_stock: null,
          missing_since: before?.missing_since ?? checked_at,
          checked_at,
        };

    try {
      await deps.write(row);
    } catch (e) {
      report.failed.push({ phrase: brand.phrase, reason: e instanceof Error ? e.message : "couldn't save it" });
      continue;
    }
    (product ? report.updated : report.flagged).push(brand.phrase);
  }
  return report;
}

/**
 * The report in words. **A failure is always named**, so a refresh that could
 * not check anything never reads as "nothing changed".
 */
export function describeRefresh(report: RefreshReport): string {
  const parts: string[] = [];
  const checked = report.updated.length + report.flagged.length + report.failed.length;
  parts.push(
    checked === 0
      ? "No exact-product brands to check."
      : `Checked ${checked} brand${checked === 1 ? "" : "s"}${report.store ? ` at ${report.store}` : ""}: ${report.updated.length} updated.`
  );
  if (report.flagged.length > 0) {
    parts.push(`Kroger no longer returns: ${report.flagged.join(", ")}.`);
  }
  if (report.failed.length > 0) {
    parts.push(`Couldn't check ${report.failed.map((f) => `${f.phrase} (${f.reason})`).join("; ")}.`);
  }
  return parts.join(" ");
}
