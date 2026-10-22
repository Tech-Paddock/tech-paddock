import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readProducts } from "@/lib/kroger";
import { estimate, findDeals, lookUp, percentOff, scanEntries, type Deal } from "@/lib/pricing";
import { saleTags, saleText } from "@/lib/saleTag";

/**
 * The on-sale tag on a list line (TEC-121, scope 3a). Kroger is mocked: the
 * tag reads prices the list tab already holds, and makes no request itself.
 */

const MILK = "0001111041700";
const STORE = "62000123";
const NOW = new Date(2026, 9, 21, 12); // 21 Oct 2026, local noon

function deal(over: Partial<Deal> = {}): Deal {
  return {
    productId: MILK,
    description: "Kroger 2% Milk",
    size: "1 gal",
    url: `https://www.kingsoopers.com/p/kroger-2-milk/${MILK}`,
    regular: 4,
    promo: 3,
    percentOff: 25,
    saving: 1,
    endsAt: "2026-10-27T23:59:59Z",
    for: ["milk", "2% Milk"],
    ...over,
  };
}

const lines = [
  { id: "a", name: "2% milk" },
  { id: "b", name: "eggs" },
];

function priced(id: string, name: string, sale: { percentOff: number; endsAt: string | null } | null) {
  return { id, name, quantity: 1, description: name, url: "", unit: 3, onSale: sale !== null, sale, lineTotal: 3 };
}

describe("the on-sale tag on a list line", () => {
  it("tags a line the latest scan found on sale at the chosen store, matched by name without case", () => {
    const tags = saleTags(lines, { locationId: STORE, scan: { location_id: STORE, deals: [deal()] }, estimate: null }, NOW);
    expect([...tags.keys()]).toEqual(["a"]);
    expect(saleText(tags.get("a")!)).toBe("On sale, 25% off until Oct 27");
  });

  it("a scan from another store, or no store, tags nothing", () => {
    const scan = { location_id: "99999999", deals: [deal()] };
    expect(saleTags(lines, { locationId: STORE, scan, estimate: null }, NOW).size).toBe(0);
    expect(saleTags(lines, { locationId: null, scan: { ...scan, location_id: STORE }, estimate: null }, NOW).size).toBe(0);
  });

  it("the estimate is the newer look: it untags a line it priced off sale and tags one it priced on sale", () => {
    const tags = saleTags(
      lines,
      {
        locationId: STORE,
        scan: { location_id: STORE, deals: [deal()] },
        estimate: { priced: [priced("a", "2% milk", null), priced("b", "eggs", { percentOff: 10, endsAt: null })] },
      },
      NOW
    );
    expect([...tags.keys()]).toEqual(["b"]);
    // No end date from Kroger: the tag leaves "until" off rather than guessing one.
    expect(saleText(tags.get("b")!)).toBe("On sale, 10% off");
  });

  it("a line the estimate could not price falls back to the scan", () => {
    const tags = saleTags(lines, { locationId: STORE, scan: { location_id: STORE, deals: [deal()] }, estimate: { priced: [] } }, NOW);
    expect(tags.has("a")).toBe(true);
  });

  it("a sale that has ended tags nothing; its last day still does", () => {
    const at = (endsAt: string) =>
      saleTags(lines, { locationId: STORE, scan: { location_id: STORE, deals: [deal({ endsAt })] }, estimate: null }, NOW);
    expect(at("2026-10-20T23:59:59Z").size).toBe(0);
    expect(at("2026-10-21T00:00:00Z").size).toBe(1);
  });

  it("reads the end day off Kroger's string, so no time zone moves it", () => {
    expect(saleText({ percentOff: 30, endsAt: "2026-11-01T00:00:00Z" })).toBe("On sale, 30% off until Nov 1");
  });

  it("says sale, never coupon", () => {
    expect(saleText({ percentOff: 5, endsAt: "2026-10-27" })).not.toMatch(/coupon/i);
    const list = readFileSync(resolve(__dirname, "../app/List.tsx"), "utf8");
    const at = list.indexOf("onSale.has(item.id)");
    expect(at).toBeGreaterThan(0);
    expect(list.slice(at, at + 400)).not.toMatch(/coupon/i);
  });

  it("is browser-safe: type-only imports, so the list never pulls in Kroger's client or the database", () => {
    const source = readFileSync(resolve(__dirname, "../lib/saleTag.ts"), "utf8");
    const imports = source.match(/^import .*$/gm) ?? [];
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.every((l) => l.startsWith("import type "))).toBe(true);
  });

  it("a sale is promo below regular; a tiny one is still at least 1% off", () => {
    expect(percentOff({ regular: 4, promo: 4 })).toBeNull();
    expect(percentOff({ regular: 4, promo: null })).toBeNull();
    expect(percentOff({ regular: null, promo: 3 })).toBeNull();
    expect(percentOff({ regular: 100, promo: 99.9 })).toBe(1);
  });
});

describe("from Kroger's answer to the tag, with Kroger mocked", () => {
  const body = {
    data: [
      {
        productId: MILK,
        upc: MILK,
        description: "Kroger 2% Milk",
        items: [
          {
            size: "1 gal",
            price: {
              regular: 4,
              promo: 3,
              effectiveDate: { value: "2026-10-21T00:00:00Z" },
              expirationDate: { value: "2026-10-27T23:59:59Z" },
            },
            fulfillment: { curbside: true, delivery: true },
          },
        ],
      },
    ],
  };

  it("the estimate's priced line carries the sale, and the scan agrees, from the one lookup each already makes", async () => {
    const byIds = vi.fn(async () => readProducts(body));
    const search = vi.fn(async () => null);
    const target = { kind: "id" as const, productId: MILK };
    const found = await lookUp([target], { byIds, search });
    expect(byIds).toHaveBeenCalledTimes(1);
    expect(search).not.toHaveBeenCalled();

    const e = estimate([{ id: "a", name: "2% milk", quantity: 1, target }], found, "PICKUP", "S");
    expect(e.priced[0].sale).toEqual({ percentOff: 25, endsAt: "2026-10-27T23:59:59Z" });

    const entries = scanEntries([], [], [{ name: "2% milk" }], () => ({
      kind: "products",
      via: "name",
      name: "2% milk",
      candidates: [{ id: "p1", upc: MILK, url: deal().url, count: 0, missing: false, description: null, size: null, sizeFirst: null, price: null, names: ["milk"] }],
    }));
    const scan = findDeals(entries, found);
    const fromScan = saleTags(lines, { locationId: STORE, scan: { location_id: STORE, deals: scan.deals }, estimate: null }, NOW);
    const fromEstimate = saleTags(lines, { locationId: STORE, scan: null, estimate: e }, NOW);
    expect(saleText(fromScan.get("a")!)).toBe("On sale, 25% off until Oct 27");
    expect(fromEstimate.get("a")).toEqual(fromScan.get("a"));
  });
});
