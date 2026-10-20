import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { refreshDue, REFRESH_EVERY_MS } from "@/lib/refreshDue";
import { describeRefresh, refreshBrands, type CachedProduct, type RefreshBrand } from "@/lib/refresh";
import type { Product } from "@/lib/kroger";

/**
 * Refresh (2026-10-20): no cron, no model, Kroger mocked. Opening the list
 * tab past a week starts one; a product Kroger stopped returning is flagged and
 * kept; a failure is said in words.
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

function brand(over: Partial<RefreshBrand> & { id: string; phrase: string }): RefreshBrand {
  return { kind: "product", url: PAGE, ...over };
}

function found(over: Partial<Product> = {}): Product {
  return {
    productId: "0085631200203",
    upc: "0085631200203",
    description: "fairlife 2% Ultra-Filtered Milk",
    brand: "fairlife",
    size: "52 fl oz",
    price: 4.99,
    inStock: true,
    url: PAGE,
    ...over,
  };
}

function deps(lookup: (id: string) => Promise<Product | null>) {
  const written: (CachedProduct & { checked_at: string })[] = [];
  return {
    written,
    deps: { lookup, write: vi.fn(async (r: CachedProduct & { checked_at: string }) => void written.push(r)), now: () => "2026-10-20T12:00:00Z" },
  };
}

describe("a refresh", () => {
  it("updates price and stock, and fills the product number from a link-only brand", async () => {
    const { written, deps: d } = deps(async () => found());
    const report = await refreshBrands([brand({ id: "p1", phrase: "milk" })], [], "King Soopers Test", d);
    expect(report.updated).toEqual(["milk"]);
    expect(written[0]).toMatchObject({ preference_id: "p1", product_id: "0085631200203", price: 4.99, in_stock: true, missing_since: null });
  });

  it("flags a product Kroger no longer returns, and keeps what was known", async () => {
    const before: CachedProduct = {
      preference_id: "p1",
      product_id: "0085631200203",
      description: "fairlife 2% Ultra-Filtered Milk",
      brand: "fairlife",
      size: "52 fl oz",
      url: PAGE,
      price: 4.99,
      in_stock: true,
      missing_since: null,
    };
    const { written, deps: d } = deps(async () => null);
    const report = await refreshBrands([brand({ id: "p1", phrase: "milk" })], [before], "King Soopers Test", d);

    expect(report.flagged).toEqual(["milk"]);
    expect(report.updated).toEqual([]);
    // Flagged and kept: the row is written, not deleted, and still says what it was.
    expect(written[0]).toMatchObject({ preference_id: "p1", description: "fairlife 2% Ultra-Filtered Milk", missing_since: "2026-10-20T12:00:00Z" });
    expect(describeRefresh(report)).toMatch(/Kroger no longer returns: milk/);
  });

  it("keeps the first day a product went missing, rather than moving it forward", async () => {
    const before = { preference_id: "p1", product_id: "0085631200203", description: null, brand: null, size: null, url: PAGE, price: null, in_stock: null, missing_since: "2026-10-01T00:00:00Z" };
    const { written, deps: d } = deps(async () => null);
    await refreshBrands([brand({ id: "p1", phrase: "milk" })], [before], null, d);
    expect(written[0].missing_since).toBe("2026-10-01T00:00:00Z");
  });

  it("says a failure in words, and never reads it as nothing changed", async () => {
    const { deps: d } = deps(async () => {
      throw new Error("Kroger's product lookup failed (HTTP 503).");
    });
    const report = await refreshBrands([brand({ id: "p1", phrase: "milk" })], [], "King Soopers Test", d);
    expect(report.failed).toEqual([{ phrase: "milk", reason: "Kroger's product lookup failed (HTTP 503)." }]);
    const words = describeRefresh(report);
    expect(words).toMatch(/Couldn't check milk \(Kroger's product lookup failed \(HTTP 503\)\.\)/);
    expect(words).not.toMatch(/nothing changed/i);
  });

  it("names a brand whose link has no product number, rather than skipping it", async () => {
    const { deps: d } = deps(async () => found());
    const report = await refreshBrands(
      [brand({ id: "p1", phrase: "milk", url: "https://www.kingsoopers.com/p/milk" })],
      [],
      null,
      d
    );
    expect(report.failed[0].phrase).toBe("milk");
  });

  it("counts search-word brands without calling Kroger for them", async () => {
    const lookup = vi.fn(async () => found());
    const { deps: d } = deps(lookup);
    const report = await refreshBrands([brand({ id: "t1", phrase: "eggs", kind: "terms", url: null })], [], null, d);
    expect(report.searchWords).toBe(1);
    expect(lookup).not.toHaveBeenCalled();
  });
});
