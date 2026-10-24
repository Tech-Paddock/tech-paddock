import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KrogerError, readProducts, type Product } from "@/lib/kroger";
import {
  describeEstimate,
  describeScan,
  estimate,
  findDeals,
  lookUp,
  scanEntries,
  targetFor,
  type EstimateLine,
} from "@/lib/pricing";
import { modalityWarning, sendLines, type CartLine, type Decision } from "@/lib/cart";
import { COUPONS_SEARCH_URL, couponsUrl } from "@/lib/kingsoopers";
import { scanDue, REFRESH_EVERY_MS } from "@/lib/refreshDue";

/**
 * The deal scan, the estimated total and Pickup/Delivery (TEC-121). Kroger is
 * mocked entirely, against the shapes the 2026-10-20 probe confirmed: promo
 * with dates, fulfilment flags, several IDs per `filter.productId`.
 */

const MILK = "0001111041700";
const EGGS = "0001111060933";

/** A line decided by one saved product with this code (TEC-131). */
function saved(productId: string, name = "milk"): Decision {
  return {
    kind: "products",
    via: "name",
    name,
    candidates: [
      { id: "p1", upc: productId, url: `https://www.kingsoopers.com/p/x/${productId}`, count: 0, missing: false, description: null, size: null, sizeFirst: null, price: null, names: [name] },
    ],
  };
}

function product(over: Partial<Product> = {}): Product {
  return {
    productId: MILK,
    upc: MILK,
    description: "Kroger 2% Milk",
    brand: "Kroger",
    size: "1 gal",
    price: 3.49,
    regular: 3.49,
    promo: null,
    promoEnds: null,
    aisle: null,
    pickup: true,
    delivery: true,
    inStock: true,
    url: `https://www.kingsoopers.com/p/kroger-2-milk/${MILK}`,
    ...over,
  };
}

describe("reading Kroger's product", () => {
  it("keeps regular and promo apart, with the promo's end date and the fulfilment flags", () => {
    const [p] = readProducts({
      data: [
        {
          productId: MILK,
          upc: MILK,
          description: "Kroger 2% Milk",
          items: [
            {
              size: "1 gal",
              price: { regular: 3.49, promo: 2.5, effectiveDate: { value: "2026-10-21T00:00:00Z" }, expirationDate: { value: "2026-10-27T23:59:59Z" } },
              fulfillment: { curbside: true, delivery: false, inStore: true, shipToHome: false },
            },
          ],
        },
      ],
    });
    expect(p).toMatchObject({ price: 2.5, regular: 3.49, promo: 2.5, promoEnds: "2026-10-27T23:59:59Z", pickup: true, delivery: false });
  });

  it("reads promo 0 as no sale, and missing flags as not said rather than no", () => {
    const [p] = readProducts({ data: [{ productId: MILK, items: [{ price: { regular: 3.49, promo: 0 } }] }] });
    expect(p).toMatchObject({ price: 3.49, promo: null, promoEnds: null, pickup: null, delivery: null });
  });

  it("reads no price at all as null, never 0", () => {
    const [p] = readProducts({ data: [{ productId: MILK, items: [{}] }] });
    expect(p).toMatchObject({ price: null, regular: null, promo: null });
  });
});

describe("what a line is looked up as", () => {
  it("an exact product is its ID; search words and plain lines are a search", () => {
    expect(targetFor("milk", saved(MILK))).toEqual({
      kind: "id",
      productId: MILK,
    });
    expect(targetFor("bread", { kind: "terms", phrase: "bread", terms: "dave's killer bread" })).toEqual({
      kind: "term",
      term: "dave's killer bread",
    });
    expect(targetFor("eggs", null)).toEqual({ kind: "term", term: "eggs" });
    expect(targetFor("ok", null)).toMatchObject({ kind: "none" });
    // The item alone (TEC-131): quantities, units and prep words dropped.
    expect(targetFor("2 cups chopped onion", null)).toEqual({ kind: "term", term: "onion" });
  });

  it("looks every ID up in one batch and each search once, however many lines share it", async () => {
    const byIds = vi.fn(async (ids: string[]) => ids.map((id) => product({ productId: id, upc: id })));
    const search = vi.fn(async () => product({ productId: EGGS, upc: EGGS }));
    const found = await lookUp(
      [
        { kind: "id", productId: MILK },
        { kind: "id", productId: EGGS },
        { kind: "id", productId: MILK },
        { kind: "term", term: "Eggs" },
        { kind: "term", term: "eggs" },
      ],
      { byIds, search }
    );
    expect(byIds).toHaveBeenCalledTimes(1);
    expect(byIds).toHaveBeenCalledWith([MILK, EGGS]);
    expect(search).toHaveBeenCalledTimes(1);
    expect(found.get(`id:${MILK}`)?.product?.productId).toBe(MILK);
    expect(found.get("term:eggs")?.product?.productId).toBe(EGGS);
  });

  it("a refused batch is a failure for each ID, in words, not 'not found'", async () => {
    const found = await lookUp([{ kind: "id", productId: MILK }], {
      byIds: async () => {
        throw new KrogerError("Kroger's product lookup failed (HTTP 500).", 500);
      },
      search: async () => null,
    });
    expect(found.get(`id:${MILK}`)).toEqual({ product: null, error: "Kroger's product lookup failed (HTTP 500)." });
  });
});

describe("the estimated total", () => {
  const lines: EstimateLine[] = [
    { id: "a", name: "milk", quantity: 2, target: { kind: "id", productId: MILK } },
    { id: "b", name: "eggs", quantity: 1, target: { kind: "term", term: "eggs" } },
    { id: "c", name: "saffron", quantity: 1, target: { kind: "term", term: "saffron" } },
    { id: "d", name: "ok", quantity: 1, target: { kind: "none", reason: "too short for Kroger's search" } },
  ];

  it("prices each line × quantity, promo first, and names every unpriced line rather than counting it as $0", () => {
    const found = new Map([
      [`id:${MILK}`, { product: product({ price: 2.5, promo: 2.5, regular: 3.49 }), error: null }],
      ["term:eggs", { product: product({ productId: EGGS, upc: EGGS, description: "Eggs", price: null, regular: null }), error: null }],
      ["term:saffron", { product: null, error: null }],
    ]);
    const e = estimate(lines, found, "PICKUP", "King Soopers Test");
    expect(e.total).toBe(5);
    expect(e.priced).toEqual([expect.objectContaining({ id: "a", unit: 2.5, lineTotal: 5, onSale: true })]);
    expect(e.unpriced.map((u) => [u.name, u.reason])).toEqual([
      ["eggs", "Kroger gave no price at your store"],
      ["saffron", "Kroger has no match at your store"],
      ["ok", "too short for Kroger's search"],
    ]);
    const words = describeEstimate(e);
    expect(words).toMatch(/^Estimated total \$5\.00 for 1 line, pickup at King Soopers Test/);
    expect(words).toMatch(/3 lines unpriced: eggs, saffron, ok\.$/);
  });

  it("uses the chosen mode: a product not offered for delivery is unpriced, and 'not said' is not 'no'", () => {
    const found = new Map([
      [`id:${MILK}`, { product: product({ delivery: false }), error: null }],
      ["term:eggs", { product: product({ productId: EGGS, upc: EGGS, price: 4, delivery: null }), error: null }],
    ]);
    const two = lines.slice(0, 2);
    const delivery = estimate(two, found, "DELIVERY", "S");
    expect(delivery.unpriced.map((u) => u.reason)).toEqual(["not offered for delivery at your store"]);
    expect(delivery.total).toBe(4);
    expect(estimate(two, found, "PICKUP", "S").total).toBe(10.98);
  });

  it("with nothing priced there is no estimate, never $0.00", () => {
    const e = estimate(lines.slice(2), new Map([["term:saffron", { product: null, error: null }]]), "PICKUP", "S");
    expect(e.total).toBeNull();
    expect(describeEstimate(e)).not.toMatch(/\$0/);
    expect(describeEstimate(e)).toMatch(/no estimate/);
  });

  it("adds in cents, so $1.10 × 3 is $3.30", () => {
    const e = estimate([{ ...lines[0], quantity: 3 }], new Map([[`id:${MILK}`, { product: product({ price: 1.1 }), error: null }]]), "PICKUP", "S");
    expect(e.total).toBe(3.3);
  });
});

describe("the deal scan", () => {
  const products = [{ product_id: MILK, names: ["milk"] }];
  const words = [{ phrase: "bread", kind: "terms" as const, terms: "sourdough bread" }];
  const MILK_PAGE = `https://www.kingsoopers.com/p/kroger-2-milk/${MILK}`;

  it("checks every saved product, every phrase and every list line, the way Send would", () => {
    const entries = scanEntries(products, words, [{ name: "2% milk" }, { name: "eggs" }], (name) =>
      name.includes("milk") ? saved(MILK) : null
    );
    expect(entries).toEqual([
      { name: "milk", target: { kind: "id", productId: MILK } },
      { name: "bread", target: { kind: "term", term: "sourdough bread" } },
      { name: "2% milk", target: { kind: "id", productId: MILK } },
      { name: "eggs", target: { kind: "term", term: "eggs" } },
    ]);
  });

  it("shows only promo below regular, biggest percentage first, one row per product naming everything it stands for", () => {
    const entries = scanEntries(products, words, [{ name: "2% milk" }, { name: "eggs" }, { name: "butter" }], (name) =>
      name.includes("milk") ? saved(MILK) : null
    );
    const found = new Map([
      [`id:${MILK}`, { product: product({ regular: 4, promo: 3, price: 3, promoEnds: "2026-10-27T23:59:59Z" }), error: null }],
      ["term:sourdough bread", { product: product({ productId: "0000000000003", description: "Sourdough", regular: 5, promo: 2.5, price: 2.5 }), error: null }],
      ["term:eggs", { product: product({ productId: EGGS, description: "Eggs", regular: 3, promo: null, price: 3 }), error: null }],
      ["term:butter", { product: product({ productId: "0000000000004", description: "Butter", regular: null, promo: null, price: null }), error: null }],
    ]);
    const r = findDeals(entries, found);
    expect(r.deals.map((d) => [d.description, d.percentOff, d.saving])).toEqual([
      ["Sourdough", 50, 2.5],
      ["Kroger 2% Milk", 25, 1],
    ]);
    expect(r.deals[1]).toMatchObject({ for: ["milk", "2% milk"], endsAt: "2026-10-27T23:59:59Z", url: MILK_PAGE });
    expect(r.unpriced).toEqual(["butter"]);
    expect(r.checked).toBe(5);
    expect(describeScan(r, "S")).toBe("Checked 5 at S: 2 on sale. No price for butter.");
  });

  it("names what it could not check, so a failed scan never reads as 'no deals'", () => {
    const entries = scanEntries([], [{ phrase: "ox", kind: "terms", terms: "ox" }], [{ name: "eggs" }], () => null);
    const r = findDeals(entries, new Map([["term:eggs", { product: null, error: "Kroger's search failed (HTTP 500)." }]]));
    expect(r.deals).toEqual([]);
    expect(describeScan(r, "S")).toMatch(/Couldn't check ox \(too short for Kroger's search\); eggs \(Kroger's search failed/);
  });

  it("a saved product is looked up by its code, named by its first name", () => {
    const [entry] = scanEntries([{ product_id: EGGS, names: ["eggs", "a dozen eggs"] }], [], [], () => null);
    expect(entry).toEqual({ name: "eggs", target: { kind: "id", productId: EGGS } });
  });

  it("runs on the refresh's rule: over a week, or never, and only with a store", () => {
    const now = Date.parse("2026-10-21T12:00:00Z");
    const on = { configured: true, connected: true, refreshedAt: null, hasStore: true };
    expect(scanDue(on, null, now)).toBe(true);
    expect(scanDue(on, new Date(now - REFRESH_EVERY_MS - 1).toISOString(), now)).toBe(true);
    expect(scanDue(on, new Date(now - 60_000).toISOString(), now)).toBe(false);
    expect(scanDue({ ...on, hasStore: false }, null, now)).toBe(false);
    expect(scanDue({ ...on, connected: false }, null, now)).toBe(false);
  });

  it("the coupons link is the constant King Soopers search, never a request", () => {
    expect(couponsUrl("greek yogurt")).toBe(`${COUPONS_SEARCH_URL}?query=greek%20yogurt`);
    expect(couponsUrl(" ")).toBe(COUPONS_SEARCH_URL);
    for (const file of ["../lib/pricing.ts", "../lib/dealRun.ts", "../app/Deals.tsx"]) {
      const source = readFileSync(resolve(__dirname, file), "utf8");
      expect(source).not.toMatch(/kingsoopers\.com/);
      expect(source).not.toMatch(/anthropic|models/i);
    }
  });
});

describe("Pickup or Delivery on Send", () => {
  const open: CartLine[] = [
    { id: "a", name: "milk", note: null, quantity: 2, sent_at: null },
    { id: "b", name: "eggs", note: null, quantity: 1, sent_at: null },
  ];
  const picks = [
    { id: "a", upc: MILK },
    { id: "b", upc: EGGS },
  ];

  it("goes with every line", async () => {
    const add = vi.fn(async () => undefined);
    const outcomes = await sendLines({ open, picks, again: false, modality: "DELIVERY" }, { add, remember: vi.fn() });
    expect(add.mock.calls).toEqual([
      [MILK, 2, "DELIVERY"],
      [EGGS, 1, "DELIVERY"],
    ]);
    expect(modalityWarning(outcomes, "DELIVERY")).toBeNull();
  });

  it("refused as a bad request: retried once without it, the rest go without, and the send warns", async () => {
    const add = vi.fn(async (_upc: string, _q: number, m: string | null) => {
      if (m) throw new KrogerError("Kroger refused it (HTTP 400).", 400);
    });
    const outcomes = await sendLines({ open, picks, again: false, modality: "PICKUP" }, { add, remember: vi.fn() });
    expect(add.mock.calls).toEqual([
      [MILK, 2, "PICKUP"],
      [MILK, 2, null],
      [EGGS, 1, null],
    ]);
    expect(outcomes.map((o) => [o.result, o.withoutModality])).toEqual([
      ["added", true],
      ["added", true],
    ]);
    expect(outcomes[0].detail).toMatch(/without pickup/);
    expect(modalityWarning(outcomes, "PICKUP")).toBe(
      "Kroger refused the pickup choice, so 2 lines went in without it — choose pickup at checkout."
    );
  });

  it("a line that fails without it too is failed, and the field is kept for the next line", async () => {
    const add = vi.fn(async (upc: string) => {
      if (upc === MILK) throw new KrogerError("Kroger refused it (HTTP 400).", 400);
    });
    const outcomes = await sendLines({ open, picks, again: false, modality: "PICKUP" }, { add, remember: vi.fn() });
    expect(outcomes.map((o) => o.result)).toEqual(["failed", "added"]);
    expect(add.mock.calls[2]).toEqual([EGGS, 1, "PICKUP"]);
    expect(modalityWarning(outcomes, "PICKUP")).toBeNull();
  });

  it("is not retried for a sign-in or an outage — those are not about the field", async () => {
    const add = vi.fn(async () => {
      throw new KrogerError("Kroger refused it (HTTP 401).", 401, true);
    });
    const outcomes = await sendLines({ open: open.slice(0, 1), picks, again: false, modality: "PICKUP" }, { add, remember: vi.fn() });
    expect(add).toHaveBeenCalledTimes(1);
    expect(outcomes[0].result).toBe("failed");
  });
});
