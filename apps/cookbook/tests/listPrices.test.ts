import { describe, expect, it } from "vitest";
import { latestNights, nightPrice, priceLines, productFor, totalsOf } from "@/lib/listPrices";
import { refreshSummary } from "@/lib/refreshNote";
import type { Decision } from "@/lib/brands";
import type { NightRow } from "@/lib/priceWeeks";

/**
 * The Grocery list's totals (TEC-190): each line's saved product at its latest
 * nightly price, sale when on sale, never $0 for a missing price. Made-up data.
 */

const STORE = "62000001";
const night = (product_id: string, d: string, regular: number | null, sale: number | null): NightRow => ({
  product_id,
  location_id: STORE,
  night: d,
  regular,
  sale,
  in_stock: true,
  aisle: null,
});

describe("a night's price", () => {
  it("is the sale when it is below the regular, else the regular", () => {
    expect(nightPrice({ regular: 4, sale: 3 })).toEqual({ price: 3, onSale: true });
    expect(nightPrice({ regular: 4, sale: null })).toEqual({ price: 4, onSale: false });
    expect(nightPrice({ regular: 4, sale: 4 })).toEqual({ price: 4, onSale: false });
    expect(nightPrice({ regular: null, sale: 2 })).toEqual({ price: 2, onSale: true });
  });
});

describe("the latest night per product", () => {
  it("takes the newest night at the store and ignores another store", () => {
    const rows = [night("A", "2026-10-27", 4, null), night("A", "2026-10-28", 5, 3), { ...night("A", "2026-10-29", 1, null), location_id: "99999999" }];
    expect(latestNights(rows, STORE).get("A")).toMatchObject({ night: "2026-10-28" });
  });
});

describe("the product a line is priced as", () => {
  const cand = (upc: string) => ({ id: "x", upc, url: "", count: 0, missing: false, description: null, size: null, sizeFirst: null, price: null, names: [] });
  it("is the only product, the chosen one, or the single Kroger-name match; never a guess among several", () => {
    const one: Decision = { kind: "products", via: "name", name: "milk", matched: "milk", chosen: null, candidates: [cand("A")] };
    expect(productFor(one)).toBe("A");
    const chosen: Decision = { kind: "products", via: "name", name: "milk", matched: "milk", chosen: "default", candidates: [cand("A"), cand("B")] };
    expect(productFor(chosen)).toBe("A");
    const pick: Decision = { kind: "products", via: "name", name: "milk", matched: "milk", chosen: null, candidates: [cand("A"), cand("B")] };
    expect(productFor(pick)).toBeNull();
    const byName: Decision = { kind: "products", via: "description", name: "milk", candidates: [cand("A")] };
    expect(productFor(byName)).toBe("A");
    expect(productFor({ ...byName, candidates: [cand("A"), cand("B")] })).toBeNull();
    expect(productFor(null)).toBeNull();
  });
});

describe("a line's price and the section's total", () => {
  const latest = latestNights([night("A", "2026-10-28", 4, 3), night("B", "2026-10-26", 1.1, null)], STORE);

  it("multiplies the unit price by the quantity in cents", () => {
    const prices = priceLines(
      [
        { id: "a", quantity: 2, productId: "A" },
        { id: "b", quantity: 3, productId: "B" },
        { id: "c", quantity: 1, productId: "C" },
        { id: "d", quantity: 1, productId: null },
      ],
      latest
    );
    expect(prices.get("a")).toMatchObject({ unit: 3, total: 6, onSale: true, night: "2026-10-28" });
    expect(prices.get("b")?.total).toBe(3.3);
    expect(prices.get("c")).toBeNull();
    expect(prices.get("d")).toBeNull();
  });

  it("names the lines with no price and the nights the prices are from, and is null, never $0, with none", () => {
    const prices = [...priceLines([{ id: "a", quantity: 2, productId: "A" }, { id: "b", quantity: 3, productId: "B" }, { id: "c", quantity: 1, productId: "C" }], latest).values()];
    expect(totalsOf(prices)).toEqual({ total: 9.3, priced: 2, unpriced: 1, from: "2026-10-26", to: "2026-10-28" });
    expect(totalsOf([null, null])).toEqual({ total: null, priced: 0, unpriced: 2, from: null, to: null });
    expect(totalsOf([])).toMatchObject({ total: null });
  });
});

describe("the refresh log's summary", () => {
  const report = (u: number, f: number, d: number, x: number) => ({
    updated: Array(u).fill("p"),
    flagged: Array(f).fill("p"),
    drifted: Array(d).fill("p"),
    failed: Array(x).fill("p"),
  });
  it("is one line: checked, updated, sizes changed", () => {
    expect(refreshSummary(report(391, 0, 27, 0))).toEqual({ line: "Checked 391 products · 391 updated · 27 sizes changed", needsLook: false });
    expect(refreshSummary(report(1, 0, 1, 0))?.line).toBe("Checked 1 product · 1 updated · 1 size changed");
  });
  it("counts what Kroger no longer returns and what could not be checked, so collapsing hides nothing", () => {
    expect(refreshSummary(report(8, 1, 0, 1))).toEqual({
      line: "Checked 10 products · 8 updated · 0 sizes changed · 1 no longer returned · 1 couldn't be checked",
      needsLook: true,
    });
    expect(refreshSummary(null)).toBeNull();
  });
});
