import { describe, expect, it, vi } from "vitest";
import { decide, decider, lineMark, type Purchases, type SavedProduct } from "@/lib/brands";
import { planLine, type CartLine } from "@/lib/cart";
import { linkFor } from "@/lib/preferences";
import { fitting, lineAmount, packCapacity } from "@/lib/sizeFit";

/**
 * Picking by fit, then by purchases (TEC-214; `RULES.md`, *Send to cart*): a
 * named product, then the name's default, then the pack that fits the amount,
 * then the most purchased in the last 12 weeks, then the count. **Pure**: the
 * purchases are passed in, and every product here is made up.
 */

vi.mock("@/lib/supabase", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => {
        const chain: Record<string, unknown> = {};
        for (const op of ["not", "gte", "lte", "order"]) chain[op] = () => chain;
        chain.range = async () => ({ data: null, error: { message: "relation does not exist" } });
        return chain;
      },
    }),
  }),
}));

let n = 0;
function product(over: Partial<SavedProduct> = {}): SavedProduct {
  n++;
  const code = over.product_id ?? String(20000000000 + n).padStart(13, "0");
  return {
    id: `q${n}`,
    product_id: code,
    names: ["chicken"],
    count: 0,
    size_first: null,
    brand: null,
    note: null,
    description: `Test Farm Chicken ${n}`,
    kroger_brand: null,
    size: null,
    url: `https://www.kingsoopers.com/p/test/${code}`,
    price: null,
    in_stock: null,
    checked_at: null,
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

const chosenOf = (d: ReturnType<typeof decide>) => (d?.kind === "products" ? d.chosen : undefined);
const firstOf = (d: ReturnType<typeof decide>) => (d?.kind === "products" ? d.candidates[0] : undefined);
const bought = (rows: [SavedProduct, number, string][]): Purchases => new Map(rows.map(([p, orders, last]) => [p.id, { orders, last_ordered_on: last }]));

describe("the pack that fits the amount", () => {
  const small = () => product({ size: "1-2 lb", count: 9 });
  const big = () => product({ size: "3-5 lb", count: 1 });

  it('"4 lb chicken" picks the 3-5 lb pack over the 1-2 lb, whatever was counted', () => {
    const a = small();
    const b = big();
    const d = decide("4 lb chicken", [a, b], []);
    expect(chosenOf(d)).toBe("fit");
    expect(firstOf(d)?.upc).toBe(b.product_id);
    expect(lineMark(d)).toBe("★");
  });

  it('"1 lb chicken" picks the 1-2 lb pack', () => {
    const a = small();
    const b = big();
    const d = decide("1 lb chicken", [b, a], []);
    expect(chosenOf(d)).toBe("fit");
    expect(firstOf(d)?.upc).toBe(a.product_id);
  });

  it("reads 1 lb and 16 oz as one size", () => {
    const sixteen = product({ size: "16 oz" });
    const two = product({ size: "2 lb" });
    expect(firstOf(decide("1 lb chicken", [two, sixteen], []))?.upc).toBe(sixteen.product_id);
    expect(firstOf(decide("16 oz chicken", [two, sixteen], []))?.upc).toBe(sixteen.product_id);
  });

  it("takes the closest when no pack covers the amount", () => {
    const a = small();
    const b = big();
    expect(firstOf(decide("10 lb chicken", [a, b], []))?.upc).toBe(b.product_id);
  });

  it("falls to the size first bought when the current size is missing", () => {
    const a = product({ size: null, size_first: "1 lb" });
    const b = product({ size: "3 lb" });
    expect(firstOf(decide("1 lb chicken", [b, a], []))?.upc).toBe(a.product_id);
  });

  it("leaves a pack in a different kind of unit out of it", () => {
    const tray = product({ size: "6 ct", count: 1 });
    const pack = product({ size: "3-5 lb", count: 1 });
    expect(firstOf(decide("4 lb chicken", [tray, pack], []))?.upc).toBe(pack.product_id);
  });

  it("two packs of the same size are decided by purchases", () => {
    const a = product({ size: "3 lb", count: 9 });
    const b = product({ size: "3 lb", count: 1 });
    const c = product({ size: "1 lb", count: 20 });
    const d = decide("3 lb chicken", [a, b, c], [], bought([[b, 2, "2026-10-20"]]));
    expect(chosenOf(d)).toBe("bought");
    expect(firstOf(d)?.upc).toBe(b.product_id);
  });

  it("parses amounts and sizes", () => {
    expect(lineAmount("4 lb chicken")?.amount).toBe(64);
    expect(lineAmount("chicken")).toBeNull();
    expect(lineAmount("2 chicken breasts")).toBeNull();
    expect(packCapacity("approx. 3-5 lb")?.amount).toBe(80);
    expect(packCapacity("12 pk / 12 fl oz")?.dimension).toBe("volume");
    expect(packCapacity("a big one")).toBeNull();
    expect(fitting([{ amount: 16, dimension: "weight" }, null], { amount: 16, dimension: "weight" })).toEqual([0]);
  });
});

describe("the most purchased", () => {
  it("wins a tie on size, over a higher count", () => {
    const counted = product({ size: "2 lb", count: 50 });
    const purchased = product({ size: "2 lb", count: 1 });
    const d = decide("2 lb chicken", [counted, purchased], [], bought([[purchased, 3, "2026-10-01"], [counted, 1, "2026-10-30"]]));
    expect(chosenOf(d)).toBe("bought");
    expect(firstOf(d)?.upc).toBe(purchased.product_id);
  });

  it("wins when the line has no amount", () => {
    const counted = product({ size: "1 lb", count: 50 });
    const purchased = product({ size: "5 lb", count: 1 });
    const d = decide("chicken", [counted, purchased], [], bought([[purchased, 2, "2026-10-01"]]));
    expect(firstOf(d)?.upc).toBe(purchased.product_id);
  });

  it("a tie on purchases goes to the most recent purchase", () => {
    const older = product({ count: 9 });
    const newer = product({ count: 1 });
    const d = decide("chicken", [older, newer], [], bought([[older, 2, "2026-09-20"], [newer, 2, "2026-10-28"]]));
    expect(firstOf(d)?.upc).toBe(newer.product_id);
  });

  it("a product with purchases beats one with none", () => {
    const counted = product({ count: 50 });
    const purchased = product({ count: 0 });
    expect(firstOf(decide("chicken", [counted, purchased], [], bought([[purchased, 1, "2026-10-01"]])))?.upc).toBe(purchased.product_id);
  });

  it("with no purchases for any, the count decides", () => {
    const low = product({ count: 2 });
    const high = product({ count: 7 });
    const d = decide("chicken", [low, high], [], new Map());
    expect(chosenOf(d)).toBe("bought");
    expect(firstOf(d)?.upc).toBe(high.product_id);
    // Purchases for a product that is not a candidate change nothing.
    expect(firstOf(decide("chicken", [low, high], [], bought([[product(), 5, "2026-10-01"]])))?.upc).toBe(high.product_id);
  });

  it("a tie all the way down is still Pick one", async () => {
    const a = product({ count: 3 });
    const b = product({ count: 3 });
    const d = decide("chicken", [a, b], []);
    expect(chosenOf(d)).toBeNull();
    const plan = await planLine({ id: "x", name: "chicken", note: null, quantity: 1, sent_at: null } as CartLine, () => d, async () => []);
    expect(plan.kind).toBe("settle");
  });
});

describe("a default still wins over all of it", () => {
  it("beats the fit, the purchases and the count", () => {
    const def = product({ size: "1 lb", count: 0, default_for: ["chicken"] });
    const fit = product({ size: "4 lb", count: 40 });
    const d = decide("4 lb chicken", [fit, def], [], bought([[fit, 9, "2026-10-30"]]));
    expect(chosenOf(d)).toBe("default");
    expect(firstOf(d)?.upc).toBe(def.product_id);
  });

  it("a named product beats the default, as before", () => {
    const def = product({ size: "4 lb", default_for: ["chicken"] });
    const named = product({ size: "1 lb", description: "Test Farm Organic Chicken" });
    expect(chosenOf(decide("organic chicken", [def, named], []))).toBe("named");
  });

  it("nothing is picked by fit among a default-less single product", () => {
    expect(chosenOf(decide("4 lb chicken", [product({ size: "1 lb" })], []))).toBeNull();
  });
});

describe("the list, the plan and the deal scan follow", () => {
  it("one decider gives the list's link and Send's plan the same product", async () => {
    const a = product({ size: "1-2 lb" });
    const b = product({ size: "3-5 lb" });
    const decideLine = decider([a, b], [], new Map());
    const d = decideLine("4 lb chicken", null);
    expect(linkFor("4 lb chicken", d).href).toBe(b.url);
    const plan = await planLine({ id: "x", name: "4 lb chicken", note: null, quantity: 1, sent_at: null }, decideLine, async () => []);
    expect(plan).toMatchObject({ kind: "exact", chosen: "fit", upc: b.product_id });
  });

  it("bulk produce still decides as its bag, and the purchases ride along", () => {
    const loose = product({ names: ["onions"], size: "1 lb" });
    const bag = product({ names: ["onions 3 lb bag"], description: "Test Farm Yellow Onions Bag", size: "3 lb" });
    const bag2 = product({ names: ["onions 3 lb bag"], description: "Test Farm Sweet Onions Bag", size: "3 lb" });
    const d = decider([loose, bag, bag2], [], bought([[bag2, 2, "2026-10-01"]]))("5 onions", null);
    expect(firstOf(d)?.upc).toBe(bag2.product_id);
  });
});

describe("a failed purchases read degrades to the count, never an error", () => {
  it("purchasesForPicking returns an empty map", async () => {
    const { purchasesForPicking } = await import("@/lib/purchaseStore");
    const read = await purchasesForPicking();
    expect(read.size).toBe(0);
    const a = product({ count: 1 });
    const b = product({ count: 4 });
    expect(firstOf(decide("chicken", [a, b], [], read))?.upc).toBe(b.product_id);
  });
});
