import { describe, expect, it } from "vitest";
import { buildDealBoard, type BoardInput, type DealBoard } from "@/lib/dealRows";
import { NO_FILTER, OPENING_FILTER, emptyMessage, matchesFilter, type DealFilter } from "@/lib/dealFilter";
import type { SavedProduct } from "@/lib/brands";
import type { NightRow } from "@/lib/priceWeeks";

/** The Bought switch and the opening view (paddock-issues#72). Made-up products. */

const AS_OF = "2026-11-17";
const STORE = { locationId: "01400999", name: "Test Store" };
const A = "0002222000001"; // bought in the window, on sale, with a coupon
const B = "0002222000002"; // sent to the cart in the window only, ordinary
const C = "0002222000003"; // never bought, on sale

const saved = (product_id: string, count = 0): SavedProduct =>
  ({ id: `id-${product_id}`, product_id, names: [`item ${product_id}`], count, description: null, size: null, size_first: null, url: null }) as unknown as SavedProduct;

const night = (product_id: string, n: string, regular: number, sale: number | null): NightRow => ({
  product_id,
  location_id: STORE.locationId,
  night: n,
  regular,
  sale,
  in_stock: true,
  aisle: "Pantry",
});

const coupon = (code: string) =>
  ({ id: "c1", title: "Coupon", amount: "$1 off", expires_on: null, week_seen: "2026-11-16", product_ids: [code] }) as unknown as BoardInput["coupons"][number];

function board(over: Partial<BoardInput> = {}): DealBoard {
  return buildDealBoard({
    asOf: AS_OF,
    store: STORE,
    products: [saved(A), saved(B), saved(C)],
    nights: [night(A, AS_OF, 5, 4), night(B, AS_OF, 3, null), night(C, AS_OF, 4, 3)],
    weeks: [],
    coupons: [coupon(A)],
    couponsStaged: true,
    scan: null,
    boughtIds: new Set([`id-${A}`]),
    sentCodes: new Set([B]),
    ...over,
  });
}
const f = (over: Partial<DealFilter>): DealFilter => ({ ...NO_FILTER, ...over });
const ids = (b: DealBoard, over: Partial<DealFilter>) => b.rows.filter((r) => matchesFilter(r, f(over))).map((r) => r.productId).sort();

describe("the tab opens on Best, Bought off", () => {
  it("is Best with Bought off, and NO_FILTER still means everything", () => {
    expect(OPENING_FILTER).toMatchObject({ kind: "best", bought: false, light: "any", aisle: "All", query: "" });
    expect(NO_FILTER.kind).toBe("all");
  });
});

describe("which rows are bought", () => {
  it("is a purchase in the window or a cart send, by product, and nothing else", () => {
    const b = board();
    expect(b.rows.filter((r) => r.boughtRecently).map((r) => r.productId).sort()).toEqual([A, B].sort());
    expect(b.purchasesRead).toBe(true);
  });
  it("a purchase of a product the board does not hold changes nothing", () => {
    expect(ids(board({ boughtIds: new Set(["id-other"]) }), { bought: true })).toEqual([B]);
  });
  it("a failed purchases read is marked on the board, and cart sends still count", () => {
    const b = board({ boughtIds: null });
    expect(b.purchasesRead).toBe(false);
    expect(ids(b, { bought: true })).toEqual([B]);
  });
  it("a failed cart read is marked too, and purchases still count", () => {
    const b = board({ sentCodes: null });
    expect(b.purchasesRead).toBe(false);
    expect(ids(b, { bought: true })).toEqual([A]);
  });
  it("an all-time cart count alone is not bought: only a send in the window is", () => {
    const b = board({ products: [saved(A), saved(B, 5), saved(C)], sentCodes: new Set() });
    expect(ids(b, { bought: true })).toEqual([A]);
  });
});

describe("Bought combines with every filter", () => {
  const b = board();
  it("off by default shows all; on limits to bought", () => {
    expect(ids(b, {})).toEqual([A, B, C].sort());
    expect(ids(b, { bought: true })).toEqual([A, B].sort());
  });
  it("Coupon + Bought is coupons on things I buy; On sale + Bought leaves out the unbought sale", () => {
    expect(ids(b, { kind: "coupon", bought: true })).toEqual([A]);
    expect(ids(b, { kind: "sale", bought: true })).toEqual([A]);
    expect(ids(b, { kind: "sale" })).toEqual([A, C].sort());
    expect(ids(b, { kind: "stack", bought: true })).toEqual([A]);
  });
  it("search and aisle still apply", () => {
    expect(ids(b, { bought: true, query: B })).toEqual([B]);
    expect(ids(b, { bought: true, aisle: "Elsewhere" })).toEqual([]);
  });
});

describe("an empty Bought result says why", () => {
  const none = board({ boughtIds: new Set(), sentCodes: new Set(), products: [saved(A), saved(C)], nights: [night(A, AS_OF, 5, 4), night(C, AS_OF, 4, 3)] });
  const some = board();

  it("a failed purchases read says so, not that nothing was bought", () => {
    const m = emptyMessage(board({ boughtIds: null, products: [saved(A)], nights: [night(A, AS_OF, 5, 4)] }), f({ bought: true }));
    expect(m.title).toBe("Couldn't read your purchases");
  });
  it("nothing bought at all", () => {
    expect(emptyMessage(none, f({ bought: true })).title).toBe("Nothing bought in the last 12 weeks");
  });
  it("coupons: none of the bought items has one", () => {
    const m = emptyMessage(board({ coupons: [coupon(C)] }), f({ kind: "coupon", bought: true }));
    expect(m.title).toBe("None of your bought items has a coupon this week");
  });
  it("coupons not staged still says so first", () => {
    expect(emptyMessage(board({ coupons: [], couponsStaged: false }), f({ kind: "coupon", bought: true })).title).toBe("No coupons staged yet");
  });
  it("sale and Best name the bought items; Best under 2 nights keeps its own reason", () => {
    expect(emptyMessage(some, f({ kind: "sale", bought: true })).title).toBe("None of your bought items is on sale");
    expect(emptyMessage({ ...some, nightsHeld: 1 }, f({ kind: "best", bought: true })).title).toBe("No best deals yet");
    expect(emptyMessage({ ...some, nightsHeld: 9 }, f({ kind: "best", bought: true })).title).toBe("None of your bought items is at its low right now");
  });
  it("Best without Bought is unchanged", () => {
    expect(emptyMessage({ ...some, nightsHeld: 9 }, f({ kind: "best" })).title).toBe("Nothing is at its low right now");
  });
  it("colours before 4 weeks keep their start date", () => {
    expect(emptyMessage(some, f({ light: "green", bought: true })).title).toBe("No green deals yet");
  });
  it("anything else says none of the bought items match", () => {
    expect(emptyMessage(some, f({ bought: true, query: "zzz" })).title).toBe("None of your bought items match");
  });
});
