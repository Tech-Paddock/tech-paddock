import { describe, expect, it } from "vitest";
import { buildDealBoard, type BoardInput, type BoughtProduct } from "@/lib/dealRows";
import { NO_FILTER, matchesFilter } from "@/lib/dealFilter";
import { canonicalCode, boughtItems } from "@/lib/purchases";
import type { SavedProduct } from "@/lib/brands";
import type { NightRow } from "@/lib/priceWeeks";

/** Bought-but-unsaved products on the Deals board (paddock-issues#77). Made-up products. */

const AS_OF = "2026-11-24";
const STORE = { locationId: "01400999", name: "Test Store" };
const SAVED = "0003333000001";
const UNSAVED = "0003333000002";
const GONE = "0003333000003";

const saved = (product_id: string): SavedProduct =>
  ({ id: `id-${product_id}`, product_id, names: [`item ${product_id}`], count: 3, description: null, size: null, size_first: null, url: null }) as unknown as SavedProduct;

const night = (product_id: string, n: string, regular: number, sale: number | null, aisle: string | null = "Pantry"): NightRow => ({
  product_id,
  location_id: STORE.locationId,
  night: n,
  regular,
  sale,
  in_stock: true,
  aisle,
});

const bought = (code: string, over: Partial<BoughtProduct> = {}): BoughtProduct => ({ code, description: `Test Oat Milk ${code.slice(-1)}`, size: "64 fl oz", recent: true, ...over });

function board(over: Partial<BoardInput> = {}) {
  return buildDealBoard({
    asOf: AS_OF,
    store: STORE,
    products: [saved(SAVED)],
    nights: [night(SAVED, AS_OF, 5, null), night(UNSAVED, AS_OF, 6, 4.5, "Dairy")],
    weeks: [],
    coupons: [],
    couponsStaged: false,
    scan: null,
    boughtIds: new Set(),
    sentCodes: new Set(),
    boughtProducts: [bought(SAVED, { description: "Purchase name of the saved one" }), bought(UNSAVED)],
    ...over,
  });
}

describe("a bought product that is not saved", () => {
  it("is a row, named by its last purchase line, with its sale and shade", () => {
    const row = board().rows.find((r) => r.productId === UNSAVED);
    expect(row).toMatchObject({ name: "Test Oat Milk 2", size: "64 fl oz", aisle: "Dairy", now: 4.5, onSale: true, bought: 0, boughtRecently: true, names: [] });
    expect(row?.url).toContain(UNSAVED);
    expect(row?.shade).toBeDefined();
    expect(row?.best).toBeDefined();
  });

  it("is searchable and groups by aisle like a saved one", () => {
    const rows = board().rows;
    expect(rows.filter((r) => matchesFilter(r, { ...NO_FILTER, query: "oat milk" })).map((r) => r.productId)).toEqual([UNSAVED]);
    expect(rows.filter((r) => matchesFilter(r, { ...NO_FILTER, aisle: "Dairy" })).map((r) => r.productId)).toEqual([UNSAVED]);
    expect(rows.filter((r) => matchesFilter(r, { ...NO_FILTER, kind: "sale" })).map((r) => r.productId)).toEqual([UNSAVED]);
  });

  it("is never a second row for a saved product, whichever way the zeros are written", () => {
    const b = board({ boughtProducts: [bought(SAVED), bought("00" + SAVED.replace(/^0+/, ""))] });
    expect(b.rows.map((r) => r.productId)).toEqual([SAVED]);
    expect(b.rows[0].name).not.toContain("Test Oat Milk");
  });

  it("leaves a saved product's row exactly as it was", () => {
    const before = board({ boughtProducts: undefined }).rows.find((r) => r.productId === SAVED);
    const after = board().rows.find((r) => r.productId === SAVED);
    expect(after).toEqual(before);
  });

  it("drops out quietly when Kroger stops returning it: no night, no row, nothing counted as unpriced", () => {
    const b = board({ boughtProducts: [bought(UNSAVED), bought(GONE)] });
    expect(b.rows.map((r) => r.productId).sort()).toEqual([SAVED, UNSAVED].sort());
    expect(b.unpriced).toBe(0);
  });

  it("an old night is not today's price for a saved product, but is for a bought one inside its rotation", () => {
    // Four nights back: past the three a saved product's price may be.
    const nights = [night(SAVED, "2026-11-20", 5, null), night(UNSAVED, "2026-11-20", 6, 4.5)];
    // One-night rotation: both are too old.
    expect(board({ nights }).rows).toHaveLength(0);
    // 3000 bought codes with 1 saved is a four-night rotation (room for 999 a night): the bought one is still its latest price.
    const many = Array.from({ length: 3000 }, (_, i) => bought(String(4000000000000 + i)));
    const b = board({ nights, boughtProducts: [bought(UNSAVED), ...many] });
    expect(b.rows.map((r) => r.productId)).toEqual([UNSAVED]);
    expect(b.unpriced).toBe(1); // the saved product, as ever
  });

  it("Bought follows its last purchase line, and a failed purchases read says so", () => {
    const old = board({ boughtProducts: [bought(UNSAVED, { recent: false })] });
    expect(old.rows.find((r) => r.productId === UNSAVED)?.boughtRecently).toBe(false);
    const sent = board({ boughtProducts: [bought(UNSAVED, { recent: false })], sentCodes: new Set([UNSAVED]) });
    expect(sent.rows.find((r) => r.productId === UNSAVED)?.boughtRecently).toBe(true);
    const failed = board({ boughtProducts: null });
    expect(failed.purchasesRead).toBe(false);
    expect(failed.rows.map((r) => r.productId)).toEqual([SAVED]);
  });
});

describe("a purchase line's code", () => {
  it("is Kroger's 13 digits, leading zeros ignored", () => {
    expect(canonicalCode("1111000001")).toBe("0001111000001");
    expect(canonicalCode("0001111000001")).toBe("0001111000001");
    expect(canonicalCode("00001111000001")).toBe("0001111000001");
  });

  it("is never guessed: no code, or all zeros, is no code", () => {
    expect(canonicalCode(null)).toBeNull();
    expect(canonicalCode("")).toBeNull();
    expect(canonicalCode("00000000")).toBeNull();
    expect(canonicalCode("12ab")).toBeNull();
  });

  it("names each distinct code by its most recent line and skips lines without one", () => {
    const items = boughtItems([
      { upc: "1111000001", description: "Old name", size: "1 lb", ordered_on: "2026-09-01" },
      { upc: "0001111000001", description: "New name", size: "16 oz", ordered_on: "2026-11-01" },
      { upc: null, description: "No code at all", size: null, ordered_on: "2026-11-02" },
      { upc: "2222000002", description: "Other", size: null, ordered_on: "2026-10-01" },
    ]);
    expect(items).toEqual([
      { code: "0001111000001", description: "New name", size: "16 oz", last_ordered_on: "2026-11-01" },
      { code: "0002222000002", description: "Other", size: null, last_ordered_on: "2026-10-01" },
    ]);
  });
});
