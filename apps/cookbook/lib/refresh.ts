import { searchTerm, type Product } from "./kroger";
import { sameSize } from "./sizeDrift";
import { wordsOf } from "./itemWords";
import type { SavedProduct, Successor } from "./brands";
import type { CachePatch } from "./productStore";

/**
 * Refresh — what Kroger says now about every saved product (2026-10-20;
 * one row per code since TEC-131). **No model call.** At the chosen store:
 *
 * - **Price, stock, page, description and size now**, in one batched lookup
 *   (fifty codes per request).
 * - **The size first bought is never overwritten.** It is filled only when
 *   empty; a different size now is reported as drift.
 * - **A code Kroger no longer returns is flagged, never dropped**, and Kroger
 *   is searched by the product's description for **the closest product by
 *   name**, offered as its successor. Replacing is the user's tap
 *   (`replaceWithSuccessor`), never this.
 *
 * Pure, with Kroger and the database passed in; `runRefresh` in
 * `lib/refreshRun.ts` supplies them.
 */

export type RefreshReport = {
  store: string | null;
  updated: string[];
  flagged: string[];
  /** Products whose size now differs from the size first bought. */
  drifted: { name: string; was: string; now: string }[];
  /** Flagged products for which a successor is on offer. */
  successors: string[];
  failed: { name: string; reason: string }[];
  /** Search-word phrases: there is no one product to check. */
  searchWords: number;
};

export type RefreshDeps = {
  /** Many products at the store by code; absent from the answer means Kroger no longer returns it. */
  byIds: (productIds: string[]) => Promise<Product[]>;
  /** Kroger's matches for words at the store, best first. */
  search: (term: string) => Promise<Product[]>;
  write: (id: string, patch: CachePatch) => Promise<void>;
  now: () => string;
};

/**
 * The closest product by name: the most words shared with the old
 * description (as a share of both), Kroger's order breaking a tie. Never one
 * already saved (`exclude`), so replacing never collides with another row.
 */
export function closestProduct(description: string, candidates: Product[], exclude: Set<string>): Product | null {
  const want = new Set(wordsOf(description));
  let best: Product | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    if (exclude.has(c.productId) || exclude.has(c.upc)) continue;
    const have = new Set(wordsOf(c.description));
    let shared = 0;
    for (const w of want) if (have.has(w)) shared++;
    const union = new Set([...want, ...have]).size;
    const score = union === 0 ? 0 : shared / union;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

function successorOf(p: Product): Successor {
  return { product_id: p.productId, description: p.description, size: p.size, url: p.url, price: p.price };
}

/** Run `task` over `items`, `limit` at a time. */
async function inBatches<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) await task(items[next++]);
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export async function refreshProducts(
  products: SavedProduct[],
  searchWords: number,
  store: string | null,
  deps: RefreshDeps
): Promise<RefreshReport> {
  const report: RefreshReport = { store, updated: [], flagged: [], drifted: [], successors: [], failed: [], searchWords };
  if (products.length === 0) return report;
  const label = (p: SavedProduct) => p.names[0] ?? p.product_id;

  let found: Product[];
  try {
    found = await deps.byIds(products.map((p) => p.product_id));
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Kroger's lookup failed";
    report.failed.push(...products.map((p) => ({ name: label(p), reason })));
    return report;
  }
  const byCode = new Map<string, Product>();
  for (const f of found) {
    byCode.set(f.productId, f);
    byCode.set(f.upc, f);
  }
  const saved = new Set(products.map((p) => p.product_id));

  await inBatches(products, 4, async (p) => {
    const checked_at = deps.now();
    const product = byCode.get(p.product_id) ?? null;
    let patch: CachePatch;

    if (product) {
      patch = {
        description: product.description,
        kroger_brand: product.brand,
        size: product.size,
        url: product.url,
        price: product.price,
        in_stock: product.inStock,
        checked_at,
        missing_since: null,
        successor: null,
      };
      // **Filled when empty, never overwritten.**
      if (!p.size_first && product.size) patch.size_first = product.size;
    } else {
      // **Flagged and kept.** What was known stays, so Your brands can still say
      // what it was; the first time it went missing is kept.
      let successor = p.successor;
      const term = searchTerm(p.description ?? label(p));
      if (term) {
        try {
          const next = closestProduct(p.description ?? label(p), await deps.search(term), saved);
          successor = next ? successorOf(next) : null;
        } catch {
          // A failed search keeps whatever was on offer before; the flag stands either way.
        }
      }
      patch = {
        description: p.description,
        kroger_brand: p.kroger_brand,
        size: p.size,
        url: p.url,
        price: null,
        in_stock: null,
        checked_at,
        missing_since: p.missing_since ?? checked_at,
        successor,
      };
    }

    try {
      await deps.write(p.id, patch);
    } catch (e) {
      report.failed.push({ name: label(p), reason: e instanceof Error ? e.message : "couldn't save it" });
      return;
    }
    if (product) {
      report.updated.push(label(p));
      const first = p.size_first;
      if (first && product.size && !sameSize(first, product.size)) report.drifted.push({ name: label(p), was: first, now: product.size });
    } else {
      report.flagged.push(label(p));
      if (patch.successor) report.successors.push(label(p));
    }
  });
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
      ? "No saved products to check."
      : `Checked ${checked} product${checked === 1 ? "" : "s"}${report.store ? ` at ${report.store}` : ""}: ${report.updated.length} updated.`
  );
  if (report.drifted.length > 0) {
    parts.push(`Size changed: ${report.drifted.map((d) => `${d.name} (was ${d.was}, now ${d.now})`).join("; ")}.`);
  }
  if (report.flagged.length > 0) {
    parts.push(`Kroger no longer returns: ${report.flagged.join(", ")}.`);
    if (report.successors.length > 0) parts.push(`A replacement is offered in Your brands for ${report.successors.join(", ")}.`);
  }
  if (report.failed.length > 0) {
    parts.push(`Couldn't check ${report.failed.map((f) => `${f.name} (${f.reason})`).join("; ")}.`);
  }
  return parts.join(" ");
}
