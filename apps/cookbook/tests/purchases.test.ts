import { describe, expect, it } from "vitest";
import { lineKey, matcher, mergeLines, parsePurchases, summary, tally, toRows } from "@/lib/purchases";

/** Import purchases (TEC-213), the pure half. Every fixture is invented and generic. */

const line = (o: Record<string, unknown> = {}) =>
  JSON.stringify({ ordered_on: "2026-10-30", order_ref: "A-1", description: "Test Oat Milk", quantity: 2, ...o });

describe("parsePurchases", () => {
  it("reads one JSON object per line and ignores blank lines", () => {
    const r = parsePurchases(`${line()}\n\n${line({ description: "Test Rice", upc: "0001111000002", size: "2 lb", price: 3.5 })}\r\n`);
    expect(r.skipped).toBe(0);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[1]).toMatchObject({ upc: "0001111000002", size: "2 lb", price: 3.5, quantity: 2 });
    expect(r.lines[0]).toMatchObject({ upc: null, size: null, price: null });
  });

  it("counts and skips bad lines and keeps the good ones", () => {
    const bad = [
      "not json",
      "[1,2]",
      "42",
      line({ ordered_on: "2026-13-40" }),
      line({ ordered_on: "10/30/2026" }),
      line({ order_ref: "" }),
      line({ order_ref: undefined }),
      line({ description: "  " }),
      line({ quantity: 0 }),
      line({ quantity: "2" }),
      line({ price: -1 }),
      line({ price: "3" }),
      line({ upc: "12ab" }),
      line({ size: 5 }),
    ];
    const r = parsePurchases([line(), ...bad].join("\n"));
    expect(r.lines).toHaveLength(1);
    expect(r.skipped).toBe(bad.length);
  });

  it("never guesses a missing field", () => {
    expect(parsePurchases(line({ order_ref: undefined })).lines).toHaveLength(0);
  });
});

describe("dedupe", () => {
  it("keys a line by code when shown, else description, plus size, ignoring zeros and case", () => {
    expect(lineKey({ upc: "0001111000002", description: "x", size: "2 LB" })).toBe(lineKey({ upc: "1111000002", description: "y", size: "2 lb" }));
    expect(lineKey({ upc: null, description: "Test  Rice!", size: null })).toBe(lineKey({ upc: null, description: "test rice", size: "" }));
    expect(lineKey({ upc: null, description: "Test Rice", size: "2 lb" })).not.toBe(lineKey({ upc: null, description: "Test Rice", size: "5 lb" }));
  });

  it("the same item twice in one order and size is one line with the quantities added", () => {
    const { lines } = parsePurchases([line(), line({ quantity: 1 }), line({ order_ref: "A-2" }), line({ size: "1 gal" })].join("\n"));
    const merged = mergeLines(lines);
    expect(merged).toHaveLength(3);
    expect(merged.find((l) => l.order_ref === "A-1" && !l.size)?.quantity).toBe(3);
  });

  it("a re-paste produces the same keys, so the table's unique key drops it", () => {
    const text = [line(), line({ description: "Test Rice" })].join("\n");
    const a = toRows(parsePurchases(text).lines, () => null).map((r) => [r.order_ref, r.line_key]);
    const b = toRows(parsePurchases(text).lines, () => null).map((r) => [r.order_ref, r.line_key]);
    expect(b).toEqual(a);
  });
});

describe("matcher", () => {
  const products = [
    { id: "p1", product_id: "0001111000001", description: "Test Brand Oat Milk, 64 fl oz" },
    { id: "p2", product_id: "0001111000002", description: "Test Brand Long Grain Rice" },
    { id: "p3", product_id: "0001111000003", description: "Twin Beans" },
    { id: "p4", product_id: "0001111000004", description: "twin  beans" },
    { id: "p5", product_id: "0001111000005", description: null },
  ];
  const match = matcher(products);

  it("matches by product code first, leading zeros ignored", () => {
    expect(match({ upc: "0001111000001", description: "something else" })).toBe("p1");
    expect(match({ upc: "1111000002", description: "Test Brand Oat Milk, 64 fl oz" })).toBe("p2");
  });

  it("falls back to the Kroger description, as words", () => {
    expect(match({ upc: null, description: "TEST BRAND long-grain rice" })).toBe("p2");
    expect(match({ upc: "0009999999999", description: "Test Brand Oat Milk 64 fl oz" })).toBe("p1");
  });

  it("matches nothing rather than guess: unknown, near, or two products with one description", () => {
    expect(match({ upc: null, description: "Test Brand Oat Milk" })).toBeNull();
    expect(match({ upc: null, description: "Twin Beans" })).toBeNull();
    expect(match({ upc: "0009999999999", description: "Unknown thing" })).toBeNull();
  });

  it("keeps an unmatched line with a null product and adds no names", () => {
    const rows = toRows(parsePurchases(line({ description: "Unknown thing" })).lines, match);
    expect(rows[0].product_id).toBeNull();
    expect(Object.keys(rows[0])).not.toContain("names");
    expect(products.every((p) => !("names" in p))).toBe(true);
  });
});

describe("summary", () => {
  it("is one line", () => {
    expect(summary(14, 3, 11, 2).line).toBe("Imported 14 from 3 orders · 11 matched · 2 skipped");
    expect(summary(0, 1, 0, 0).line).toBe("Imported 0 from 1 order · 0 matched · 0 skipped");
  });
});

describe("tally (purchases per product over the last N weeks)", () => {
  const rows = [
    { product_id: "p1", order_ref: "A", ordered_on: "2026-10-30", quantity: 2 },
    { product_id: "p1", order_ref: "A", ordered_on: "2026-10-30", quantity: 1 },
    { product_id: "p1", order_ref: "B", ordered_on: "2026-10-16", quantity: 1 },
    { product_id: "p1", order_ref: "C", ordered_on: "2026-08-01", quantity: 9 },
    { product_id: "p2", order_ref: "A", ordered_on: "2026-10-30", quantity: 1 },
    { product_id: null, order_ref: "A", ordered_on: "2026-10-30", quantity: 5 },
    { product_id: "p3", order_ref: "Z", ordered_on: "2026-11-05", quantity: 1 },
  ];

  it("counts distinct orders and quantity inside the window, newest date last bought", () => {
    const t = tally(rows, 4, "2026-11-02");
    expect(t.get("p1")).toEqual({ product_id: "p1", orders: 2, quantity: 4, last_ordered_on: "2026-10-30" });
    expect(t.get("p2")?.orders).toBe(1);
  });

  it("leaves out unmatched purchases, old ones and future ones", () => {
    const t = tally(rows, 4, "2026-11-02");
    expect(t.has("p3")).toBe(false);
    expect([...t.keys()].sort()).toEqual(["p1", "p2"]);
    expect(tally(rows, 14, "2026-11-02").get("p1")?.orders).toBe(3);
  });
});
