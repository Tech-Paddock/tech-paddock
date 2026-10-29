import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isDeal, listDeals, rowsForLine } from "@/lib/listDeals";
import type { DealRow } from "@/lib/dealRows";

/** On my list (TEC-132): board rows matched to open list lines, and the list's panel without deals. Made-up products. */

const MILK = "0002222000001";
const WHOLE = "0002222000002";
const PASTA = "0002222000003";
const SAUCE = "0002222000004";
const EGGS = "0002222000005";

function row(productId: string, name: string, names: string[], over: Partial<DealRow> = {}): DealRow {
  return {
    productId,
    name,
    names,
    size: null,
    url: `https://example.test/${productId}`,
    aisle: "Pantry",
    bought: 0,
    now: 3,
    usual: 3,
    onSale: false,
    percentOff: null,
    inStock: true,
    priceDate: "2026-10-26",
    source: "nightly",
    light: "neutral",
    note: "about its usual",
    weeks: 8,
    trend: [],
    coupons: [],
    stacks: false,
    ...over,
  };
}

const sale = { onSale: true, percentOff: 20 };
const board = [
  row(MILK, "Test Milk 1 gal", ["milk"], sale),
  row(WHOLE, "Test Whole Milk 1 gal", ["whole milk"], { onSale: true, percentOff: 10 }),
  row(PASTA, "Test Spaghetti 16 oz", [], { onSale: true, percentOff: 30 }),
  row(SAUCE, "Test Spaghetti Sauce 24 oz", ["spaghetti sauce"], { onSale: true, percentOff: 40 }),
  row(EGGS, "Test Large Eggs 12 ct", ["eggs"]),
];

describe("matching a list line to the board", () => {
  it("finds a product by a saved name, as whole words", () => {
    expect(rowsForLine("2% milk", board).map((r) => r.productId)).toEqual([MILK]);
    expect(rowsForLine("buttermilk", board)).toEqual([]);
  });

  it("the longest saved name wins, as on the list", () => {
    expect(rowsForLine("whole milk", board).map((r) => r.productId)).toEqual([WHOLE]);
  });

  it("a product code typed as the line is that product", () => {
    expect(rowsForLine(PASTA, board).map((r) => r.productId)).toEqual([PASTA]);
  });

  it("falls back to the official name only when no saved name matched", () => {
    // "spaghetti" names no saved product, so it reads the official names; "spaghetti sauce" is a saved name.
    expect(rowsForLine("spaghetti", board).map((r) => r.productId).sort()).toEqual([PASTA, SAUCE].sort());
    expect(rowsForLine("spaghetti sauce", board).map((r) => r.productId)).toEqual([SAUCE]);
  });
});

describe("On my list", () => {
  it("lists the deals an open line finds, with the line that found each", () => {
    const found = listDeals(board, ["milk", "eggs"]);
    expect(found.map((d) => d.row.productId)).toEqual([MILK]);
    expect(found[0].lines).toEqual(["milk"]);
  });

  it("a priced product that is not a deal is not listed", () => {
    expect(isDeal(board[4])).toBe(false);
    expect(listDeals(board, ["eggs"])).toEqual([]);
  });

  it("a sale, a coupon or a green light each make a deal", () => {
    expect(isDeal(row("a", "a", [], { onSale: true }))).toBe(true);
    expect(isDeal(row("a", "a", [], { coupons: [{ title: "t", amount: "$1", expires_on: null }] }))).toBe(true);
    expect(isDeal(row("a", "a", [], { light: "green" }))).toBe(true);
    expect(isDeal(row("a", "a", [], { light: "red" }))).toBe(false);
  });

  it("one product found by two lines is listed once, naming both", () => {
    const found = listDeals(board, ["milk", "2 gallons of milk", "milk"]);
    expect(found).toHaveLength(1);
    expect(found[0].lines).toEqual(["milk", "2 gallons of milk"]);
  });

  it("puts stacks first, then green, then the bigger sale", () => {
    const stack = row("s", "Stack", ["stack"], { onSale: true, percentOff: 5, stacks: true });
    const green = row("g", "Green", ["green"], { light: "green", onSale: true, percentOff: 6 });
    const big = row("b", "Big", ["big"], { onSale: true, percentOff: 50 });
    const small = row("m", "Small", ["small"], { onSale: true, percentOff: 7 });
    const found = listDeals([small, big, green, stack], ["small", "big", "green", "stack"]);
    expect(found.map((d) => d.row.productId)).toEqual(["s", "g", "b", "m"]);
  });

  it("says nothing is on sale by returning nothing when no open line matches", () => {
    expect(listDeals(board, ["bananas"])).toEqual([]);
    expect(listDeals(board, [])).toEqual([]);
  });
});

describe("the surfaces", () => {
  const read = (file: string) => readFileSync(resolve(__dirname, file), "utf8");

  it("the list's King Soopers panel no longer renders deals, and its scan has no button", () => {
    const cart = read("../app/Cart.tsx");
    expect(cart).not.toMatch(/DealsPanel/);
    expect(cart).not.toMatch(/Scan for deals/);
    // What stays: Take back (it is Clear cart now), and the connection. The live estimate is gone (TEC-190).
    expect(cart).not.toMatch(/EstimatePanel/);
    expect(cart).not.toMatch(/\/api\/kroger\/estimate/);
    expect(cart).toMatch(/TakeBackConfirm/);
  });

  it("a list line keeps its sale tag, read from the scan", () => {
    const list = read("../app/List.tsx");
    expect(list).toMatch(/saleTags\(/);
    expect(list).toMatch(/saleText\(/);
    expect(list).toMatch(/cart\.latestScan/);
  });

  it("the Deals tab reads /api/deals and nothing else: no Kroger call for On my list", () => {
    const tab = read("../app/DealsTab.tsx");
    expect(tab).toMatch(/listDeals\(/);
    expect([...tab.matchAll(/fetch\(\s*"([^"]+)"/g)].map((m) => m[1])).toEqual(["/api/deals"]);
    expect(tab).toMatch(/Nothing on your list has a deal right now\./);
  });

  it("the list hands its open lines up, and the Deals tab receives them", () => {
    expect(read("../app/List.tsx")).toMatch(/onOpenLines/);
    expect(read("../app/Cookbook.tsx")).toMatch(/<DealsTab refreshKey=\{brandsVersion\} openLines=\{openLines\}/);
  });
});
