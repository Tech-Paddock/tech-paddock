import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { refreshDue, REFRESH_EVERY_MS } from "@/lib/refreshDue";
import { closestProduct, describeRefresh, refreshProducts } from "@/lib/refresh";
import type { SavedProduct } from "@/lib/brands";
import type { CachePatch } from "@/lib/productStore";
import type { Product } from "@/lib/kroger";

/**
 * Refresh (2026-10-20; product rows since TEC-131): no cron, no model, Kroger
 * mocked. Opening the list tab past a week starts one; the size first bought
 * is never overwritten; a product Kroger stopped returning is flagged, kept,
 * and offered a successor; a failure is said in words.
 */

const NOW = Date.parse("2026-10-20T12:00:00Z");
const connected = { configured: true, connected: true };

describe("opening the list tab", () => {
  it("starts a refresh when the last one is over a week old", () => {
    const stale = new Date(NOW - REFRESH_EVERY_MS - 60_000).toISOString();
    expect(refreshDue({ ...connected, refreshedAt: stale }, NOW)).toBe(true);
  });

  it("starts one when there has never been one", () => {
    expect(refreshDue({ ...connected, refreshedAt: null }, NOW)).toBe(true);
  });

  it("does not when the last one is fresh", () => {
    const fresh = new Date(NOW - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(refreshDue({ ...connected, refreshedAt: fresh }, NOW)).toBe(false);
  });

  it("does not when King Soopers is not connected or the deployment is not set up", () => {
    expect(refreshDue({ configured: true, connected: false, refreshedAt: null }, NOW)).toBe(false);
    expect(refreshDue({ configured: false, connected: true, refreshedAt: null }, NOW)).toBe(false);
  });

  it("is what the list tab asks, and the refresh it starts is not awaited", () => {
    const cart = readFileSync(resolve(__dirname, "../app/Cart.tsx"), "utf8");
    expect(cart).toMatch(/refreshDue\(s\)/);
    expect(cart).toMatch(/void refresh\(\); \/\/ not awaited/);
  });

  it("the checkout link is the constant, not a typed address", () => {
    const cart = readFileSync(resolve(__dirname, "../app/Cart.tsx"), "utf8");
    expect(cart).toMatch(/href=\{CHECKOUT_URL\}/);
    expect(cart).not.toMatch(/kingsoopers\.com\/cart/);
  });
});

const PAGE = "https://www.kingsoopers.com/p/fairlife-2-milk/0085631200203";
const CODE = "0085631200203";

function saved(over: Partial<SavedProduct> = {}): SavedProduct {
  return {
    id: "p1",
    product_id: CODE,
    names: ["milk"],
    count: 3,
    size_first: "52 fl oz",
    brand: null,
    note: null,
    description: "fairlife 2% Ultra-Filtered Milk",
    kroger_brand: "fairlife",
    size: "52 fl oz",
    url: PAGE,
    price: 4.99,
    in_stock: true,
    checked_at: "2026-10-01T00:00:00Z",
    missing_since: null,
    successor: null,
    pack_label: null,
    pack_size: null,
    pack_unit: null,
    default_for: [],
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

function found(over: Partial<Product> = {}): Product {
  return {
    productId: CODE,
    upc: CODE,
    description: "fairlife 2% Ultra-Filtered Milk",
    brand: "fairlife",
    size: "52 fl oz",
    price: 4.99,
    regular: 4.99,
    promo: null,
    promoEnds: null,
    aisle: null,
    pickup: true,
    delivery: true,
    inStock: true,
    url: PAGE,
    ...over,
  };
}

function deps(byIds: (ids: string[]) => Promise<Product[]>, search: (term: string) => Promise<Product[]> = async () => []) {
  const written: { id: string; patch: CachePatch }[] = [];
  return {
    written,
    deps: {
      byIds: vi.fn(byIds),
      search: vi.fn(search),
      write: vi.fn(async (id: string, patch: CachePatch) => void written.push({ id, patch })),
      now: () => "2026-10-20T12:00:00Z",
    },
  };
}

describe("a refresh (one row per product code, TEC-131)", () => {
  it("checks every product in one batched lookup, and updates price, stock and page", async () => {
    const { written, deps: d } = deps(async () => [found({ price: 5.49 }), found({ productId: "0000000000022", upc: "0000000000022" })]);
    const report = await refreshProducts([saved(), saved({ id: "p2", product_id: "0000000000022", names: ["eggs"] })], 0, "King Soopers Test", d);
    expect(d.byIds).toHaveBeenCalledTimes(1);
    expect(d.byIds).toHaveBeenCalledWith([CODE, "0000000000022"]);
    expect(report.updated).toEqual(["milk", "eggs"]);
    expect(written[0]).toMatchObject({ id: "p1", patch: { price: 5.49, in_stock: true, missing_since: null, successor: null } });
  });

  it("never overwrites the size first bought, and reports a different size as drift", async () => {
    const { written, deps: d } = deps(async () => [found({ size: "46 fl oz" })]);
    const report = await refreshProducts([saved()], 0, null, d);
    expect(written[0].patch.size).toBe("46 fl oz");
    expect("size_first" in written[0].patch).toBe(false);
    expect(report.drifted).toEqual([{ name: "milk", was: "52 fl oz", now: "46 fl oz" }]);
    expect(describeRefresh(report)).toMatch(/Size changed: milk \(was 52 fl oz, now 46 fl oz\)/);
  });

  it("fills the size first bought only when it is empty", async () => {
    const { written, deps: d } = deps(async () => [found({ size: "52 fl oz" })]);
    const report = await refreshProducts([saved({ size_first: null })], 0, null, d);
    expect(written[0].patch.size_first).toBe("52 fl oz");
    expect(report.drifted).toEqual([]);
  });

  it("the same size written differently is not drift: 1 lb is 16 oz", async () => {
    const { deps: d } = deps(async () => [found({ size: "16 oz" })]);
    const report = await refreshProducts([saved({ size_first: "1 lb" })], 0, null, d);
    expect(report.drifted).toEqual([]);
  });

  it("flags a code Kroger no longer returns, keeps what was known, and offers the closest product by name", async () => {
    const search = async () => [
      found({ productId: "0000000000099", upc: "0000000000099", description: "Kroger Whole Milk" }),
      found({ productId: "0085631200210", upc: "0085631200210", description: "fairlife 2% Ultra-Filtered Milk Lactose Free", size: "46 fl oz", url: "https://www.kingsoopers.com/p/x/0085631200210" }),
    ];
    const { written, deps: d } = deps(async () => [], search);
    const report = await refreshProducts([saved()], 0, "King Soopers Test", d);

    expect(d.search).toHaveBeenCalledWith("fairlife 2% Ultra-Filtered Milk");
    expect(report.flagged).toEqual(["milk"]);
    expect(report.successors).toEqual(["milk"]);
    // Flagged and kept: still says what it was, and the first day it went missing.
    expect(written[0].patch).toMatchObject({
      description: "fairlife 2% Ultra-Filtered Milk",
      price: null,
      missing_since: "2026-10-20T12:00:00Z",
      successor: { product_id: "0085631200210", size: "46 fl oz" },
    });
    expect(describeRefresh(report)).toMatch(/Kroger no longer returns: milk\. A replacement is offered in Your brands for milk\./);
  });

  it("never offers a product already saved as a successor, nor the missing code itself", () => {
    const a = found({ productId: "0000000000011", upc: "0000000000011", description: "fairlife 2% milk" });
    const b = found({ productId: "0000000000022", upc: "0000000000022", description: "fairlife milk" });
    expect(closestProduct("fairlife 2% milk", [a, b], new Set(["0000000000011"]))?.productId).toBe("0000000000022");
    expect(closestProduct("fairlife 2% milk", [a], new Set(["0000000000011"]))).toBeNull();
    expect(closestProduct("fairlife 2% milk", [found({ description: "Garden Hose" })], new Set())).toBeNull();
  });

  it("keeps the first day a product went missing, and a failed successor search keeps the old offer", async () => {
    const offer = { product_id: "0000000000033", description: "Old offer", size: null, url: "https://www.kingsoopers.com/p/x/0000000000033", price: null };
    const { written, deps: d } = deps(
      async () => [],
      async () => {
        throw new Error("Kroger's search failed (HTTP 500).");
      }
    );
    await refreshProducts([saved({ missing_since: "2026-10-01T00:00:00Z", successor: offer })], 0, null, d);
    expect(written[0].patch.missing_since).toBe("2026-10-01T00:00:00Z");
    expect(written[0].patch.successor).toEqual(offer);
  });

  it("says a failure in words, and never reads it as nothing changed", async () => {
    const { deps: d } = deps(async () => {
      throw new Error("Kroger's product lookup failed (HTTP 503).");
    });
    const report = await refreshProducts([saved()], 0, "King Soopers Test", d);
    expect(report.failed).toEqual([{ name: "milk", reason: "Kroger's product lookup failed (HTTP 503)." }]);
    const words = describeRefresh(report);
    expect(words).toMatch(/Couldn't check milk \(Kroger's product lookup failed \(HTTP 503\)\.\)/);
    expect(words).not.toMatch(/nothing changed/i);
  });

  it("counts search-word phrases without calling Kroger, and an empty Your brands calls nothing", async () => {
    const { deps: d } = deps(async () => [found()]);
    const report = await refreshProducts([], 2, null, d);
    expect(report.searchWords).toBe(2);
    expect(d.byIds).not.toHaveBeenCalled();
    expect(describeRefresh(report)).toBe("No saved products to check.");
  });
});
