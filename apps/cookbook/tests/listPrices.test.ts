import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { latestNights, nightPrice, priceLines, productFor, repriced, totalsOf } from "@/lib/listPrices";
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

describe("a line's price follows its quantity (TEC-236)", () => {
  const latest = latestNights([night("A", "2026-10-28", 4, 3), night("B", "2026-10-26", 1.1, null)], STORE);

  it("rescales the total from the unit price in whole cents, and keeps the night and sale flag", () => {
    const a = priceLines([{ id: "a", quantity: 1, productId: "A" }], latest).get("a");
    expect(a?.total).toBe(3);
    expect(repriced(a, 4)).toEqual({ unit: 3, total: 12, onSale: true, night: "2026-10-28" });
    // 1.10 x 3 is 3.3000000000000003 in floats; the cents do not drift.
    const b = priceLines([{ id: "b", quantity: 1, productId: "B" }], latest).get("b");
    expect(repriced(b, 3)?.total).toBe(3.3);
  });

  it("agrees with pricing the line at that quantity to begin with", () => {
    const at = (q: number) => priceLines([{ id: "a", quantity: q, productId: "A" }], latest).get("a");
    for (const q of [1, 2, 7, 99]) expect(repriced(at(1), q)).toEqual(at(q));
  });

  it("leaves a line with no price at no price, never $0, and moves the section total", () => {
    expect(repriced(null, 5)).toBeNull();
    expect(repriced(undefined, 5)).toBeNull();
    const a = priceLines([{ id: "a", quantity: 1, productId: "A" }], latest).get("a");
    expect(totalsOf([repriced(a, 1), null]).total).toBe(3);
    expect(totalsOf([repriced(a, 5), null]).total).toBe(15);
  });

  it("the List applies it in the same update that changes the quantity, so no reload or send is needed", () => {
    const source = readFileSync(resolve(__dirname, "../app/List.tsx"), "utf8");
    expect(source).toMatch(/\{ \.\.\.i, quantity, price: repriced\(i\.price, quantity\) \}/);
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
