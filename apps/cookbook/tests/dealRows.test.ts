import { describe, expect, it } from "vitest";
import { buildDealBoard, FRESH_NIGHTS, NO_AISLE, type BoardInput } from "@/lib/dealRows";
import { ALL_AISLES, NO_FILTER, groupByAisle, matchesFilter, type DealFilter } from "@/lib/dealFilter";
import { couponActive, NO_EXPIRY_ACTIVE_DAYS, type Coupon } from "@/lib/couponRules";
import { addDays } from "@/lib/priceDates";
import type { SavedProduct } from "@/lib/brands";
import type { NightRow, WeekRow } from "@/lib/priceWeeks";

/** The Deals board (TEC-132): saved products, nights, weeks and coupons in; coloured rows out. Made-up products. */

const AS_OF = "2026-10-26";
const STORE = { locationId: "01400999", name: "Test Store" };
const COLA = "0001111000001";
const OATS = "0001111000002";
const SOUP = "0001111000003";

function saved(product_id: string, name: string, over: Partial<SavedProduct> = {}): SavedProduct {
  return {
    id: `id-${product_id}`,
    product_id,
    names: [name],
    count: 0,
    size_first: null,
    brand: null,
    note: null,
    description: null,
    kroger_brand: null,
    size: null,
    url: null,
    price: null,
    in_stock: null,
    checked_at: null,
    missing_since: null,
    successor: null,
    pack_label: null,
    pack_size: null,
    pack_unit: null,
    default_for: [],
    created_at: "",
    updated_at: "",
    ...over,
  };
}

const night = (product_id: string, nightDate: string, regular: number | null, sale: number | null, over: Partial<NightRow> = {}): NightRow => ({
  product_id,
  location_id: STORE.locationId,
  night: nightDate,
  regular,
  sale,
  in_stock: true,
  aisle: "Pantry",
  ...over,
});

/** `n` Monday weeks before AS_OF with a flat price. */
const weeks = (product_id: string, n: number, low: number, mean: number, regular_mean: number | null = mean): WeekRow[] =>
  Array.from({ length: n }, (_, i) => ({
    product_id,
    location_id: STORE.locationId,
    week_start: addDays("2026-10-19", -7 * i),
    low,
    high: mean,
    mean,
    regular_mean,
    nights_on_sale: 0,
    nights_seen: 7,
  }));

const coupon = (over: Partial<Coupon> = {}): Coupon => ({
  id: "c1",
  title: "Test coupon",
  amount: "$1 off 2",
  expires_on: "2026-11-02",
  week_seen: "2026-10-19",
  product_ids: [COLA],
  ...over,
});

function board(over: Partial<BoardInput> = {}) {
  return buildDealBoard({
    asOf: AS_OF,
    store: STORE,
    products: [saved(COLA, "test cola", { count: 6 })],
    nights: [night(COLA, AS_OF, 5, 3.49)],
    weeks: weeks(COLA, 8, 3.5, 5),
    coupons: [],
    couponsStaged: false,
    scan: null,
    ...over,
  });
}

describe("a deal's row", () => {
  it("has today's price, its usual price, the sale, and a colour against its own weeks", () => {
    const [row] = board().rows;
    expect(row).toMatchObject({
      productId: COLA,
      name: "test cola",
      aisle: "Pantry",
      bought: 6,
      now: 3.49,
      usual: 5,
      onSale: true,
      percentOff: 30,
      inStock: true,
      source: "nightly",
      priceDate: AS_OF,
      light: "green",
      weeks: 8,
      stacks: false,
      coupons: [],
    });
    // 3.49 is at or below the weeks' low of 3.50, and 30% under the mean.
    expect(row.note).toBe("at its 8-week low of $3.50"); // names the weeks it actually has
  });

  it("is red when the sale price is still over the mean: Kroger's tag does not decide", () => {
    const [row] = board({ nights: [night(COLA, AS_OF, 6, 5.6)] }).rows;
    expect(row).toMatchObject({ onSale: true, light: "red" });
  });

  it("an ordinary price has no colour and a short reason", () => {
    const [row] = board({ nights: [night(COLA, AS_OF, 5, null)], weeks: weeks(COLA, 8, 3, 5) }).rows;
    expect(row).toMatchObject({ light: "neutral", onSale: false, percentOff: null, now: 5, note: "about its usual" });
  });

  it("under four weeks of history is new, whatever the price", () => {
    const [row] = board({ weeks: weeks(COLA, 3, 5, 5) }).rows;
    expect(row).toMatchObject({ light: "new", note: "new: building history", weeks: 3 });
  });

  it("the trend is the last eight weekly means, oldest first", () => {
    const history = weeks(COLA, 12, 3, 5).map((w, i) => ({ ...w, mean: 5 + i / 100 })); // newest first: 5.00 ... 5.11
    const [row] = board({ weeks: history }).rows;
    expect(row.trend).toHaveLength(8);
    expect(row.trend).toEqual([5.07, 5.06, 5.05, 5.04, 5.03, 5.02, 5.01, 5]);
  });

  it("the usual price is the regular mean over the window, and today's regular with no history", () => {
    expect(board({ weeks: weeks(COLA, 8, 3, 4.5, 6) }).rows[0].usual).toBe(6);
    expect(board({ weeks: [], nights: [night(COLA, AS_OF, 5, 4)] }).rows[0].usual).toBe(5);
  });

  it("uses Kroger's name, size and page when it has them, and the saved name otherwise", () => {
    const p = saved(COLA, "test cola", { description: "Test Cola Zero", size: "12 pk", url: "https://www.kingsoopers.com/p/test/0001111000001" });
    const [row] = board({ products: [p] }).rows;
    expect(row).toMatchObject({ name: "Test Cola Zero", size: "12 pk", url: "https://www.kingsoopers.com/p/test/0001111000001" });
  });

  it("shows out of stock as stock, not as no deal", () => {
    expect(board({ nights: [night(COLA, AS_OF, 5, 3.49, { in_stock: false })] }).rows[0].inStock).toBe(false);
  });
});

describe("today's price", () => {
  it("is the latest night within the last few; an older one is not today's", () => {
    const fresh = night(COLA, addDays(AS_OF, -FRESH_NIGHTS), 5, null);
    expect(board({ nights: [fresh] }).rows).toHaveLength(1);
    const stale = night(COLA, addDays(AS_OF, -FRESH_NIGHTS - 1), 5, null);
    const b = board({ nights: [stale] });
    expect(b.rows).toHaveLength(0);
    expect(b.unpriced).toBe(1);
  });

  it("takes the latest of several nights", () => {
    const b = board({ nights: [night(COLA, "2026-10-24", 5, null), night(COLA, "2026-10-25", 5, 4), night(COLA, "2026-10-23", 9, null)] });
    expect(b.rows[0]).toMatchObject({ now: 4, priceDate: "2026-10-25" });
  });

  it("ignores another store's nights", () => {
    const b = board({ nights: [night(COLA, AS_OF, 5, 3, { location_id: "01400111" })] });
    expect(b.rows).toHaveLength(0);
    expect(b.hasNights).toBe(false);
  });

  it("a saved product with no price is counted, never shown at $0", () => {
    const b = board({ products: [saved(COLA, "test cola"), saved(OATS, "test oats")], nights: [night(COLA, AS_OF, 5, null)] });
    expect(b.rows.map((r) => r.productId)).toEqual([COLA]);
    expect(b.unpriced).toBe(1);
  });

  it("before the first nightly run, the list tab's latest deal scan fills in what it found on sale", () => {
    const scan = { ranOn: AS_OF, locationId: STORE.locationId, deals: [{ productId: COLA, regular: 5, promo: 3.99 }] };
    const b = board({ nights: [], weeks: [], scan });
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0]).toMatchObject({ source: "scan", now: 3.99, usual: 5, onSale: true, percentOff: 20, light: "new", inStock: null });
    expect(b.hasNights).toBe(false);
  });

  it("a scan from another store, or an old one, adds nothing; a night wins over a scan", () => {
    const old = { ranOn: addDays(AS_OF, -10), locationId: STORE.locationId, deals: [{ productId: COLA, regular: 5, promo: 3 }] };
    expect(board({ nights: [], scan: old }).rows).toHaveLength(0);
    const elsewhere = { ranOn: AS_OF, locationId: "01400111", deals: [{ productId: COLA, regular: 5, promo: 3 }] };
    expect(board({ nights: [], scan: elsewhere }).rows).toHaveLength(0);
    const both = { ranOn: AS_OF, locationId: STORE.locationId, deals: [{ productId: COLA, regular: 5, promo: 1 }] };
    expect(board({ scan: both }).rows[0]).toMatchObject({ source: "nightly", now: 3.49 });
  });

  it("with no store picked there is nothing, and the board says so", () => {
    const b = board({ store: null });
    expect(b).toMatchObject({ store: null, rows: [], unpriced: 0 });
  });
});

describe("weeks are the chosen store's own", () => {
  it("another store's history does not colour this store's price", () => {
    const elsewhere = weeks(COLA, 8, 3, 5).map((w) => ({ ...w, location_id: "01400111" }));
    expect(board({ weeks: elsewhere }).rows[0].light).toBe("new");
  });
});

describe("coupons", () => {
  it("match a product by code, and a sale plus a coupon is a stack", () => {
    const [row] = board({ coupons: [coupon()], couponsStaged: true }).rows;
    expect(row.coupons).toEqual([{ title: "Test coupon", amount: "$1 off 2", expires_on: "2026-11-02" }]);
    expect(row.stacks).toBe(true);
  });

  it("a coupon without a sale is a coupon, not a stack", () => {
    const [row] = board({ coupons: [coupon()], couponsStaged: true, nights: [night(COLA, AS_OF, 5, null)] }).rows;
    expect(row.coupons).toHaveLength(1);
    expect(row.stacks).toBe(false);
  });

  it("match by code only: a coupon that lists another product, or none, matches nothing", () => {
    const b = board({ coupons: [coupon({ product_ids: [OATS] }), coupon({ id: "c2", title: "Other", product_ids: [] })], couponsStaged: true });
    expect(b.rows[0].coupons).toEqual([]);
  });

  it("an expired coupon is left out, and an unexpiring one fades after two weeks", () => {
    expect(board({ coupons: [coupon({ expires_on: "2026-10-25" })], couponsStaged: true }).rows[0].coupons).toEqual([]);
    expect(board({ coupons: [coupon({ expires_on: AS_OF })], couponsStaged: true }).rows[0].coupons).toHaveLength(1);

    expect(couponActive({ expires_on: null, week_seen: "2026-10-19" }, AS_OF)).toBe(true);
    expect(couponActive({ expires_on: null, week_seen: addDays(AS_OF, -NO_EXPIRY_ACTIVE_DAYS) }, AS_OF)).toBe(false);
    expect(couponActive({ expires_on: null, week_seen: addDays(AS_OF, -NO_EXPIRY_ACTIVE_DAYS + 1) }, AS_OF)).toBe(true);
  });

  it("an empty table says none have been staged; expired ones do not unsay it", () => {
    expect(board().couponsStaged).toBe(false);
    expect(board({ coupons: [coupon({ expires_on: "2026-01-01" })], couponsStaged: true }).couponsStaged).toBe(true);
  });
});

describe("the aisles", () => {
  const products = [saved(COLA, "test cola", { count: 6 }), saved(OATS, "test oats", { count: 2 }), saved(SOUP, "test soup", { count: 9 })];
  const nights = [
    night(COLA, AS_OF, 5, null, { aisle: "Drinks" }),
    night(OATS, AS_OF, 3, null, { aisle: "Breakfast" }),
    night(SOUP, AS_OF, 2, null, { aisle: null }),
  ];

  it("a product with no aisle goes under Other, and aisles are alphabetical, most bought first within", () => {
    const rows = board({ products, nights, weeks: [] }).rows;
    expect(groupByAisle(rows).map((g) => [g.aisle, g.rows.map((r) => r.productId)])).toEqual([
      ["Breakfast", [OATS]],
      ["Drinks", [COLA]],
      [NO_AISLE, [SOUP]],
    ]);
  });
});

describe("the filters", () => {
  const products = [
    saved(COLA, "test cola", { count: 6, description: "Test Cola Zero" }),
    saved(OATS, "test oats", { count: 2, description: "Test Honey Oats" }),
    saved(SOUP, "test soup", { count: 9, description: "Test Tomato Soup" }),
  ];
  const nights = [
    night(COLA, AS_OF, 5, 3.49, { aisle: "Drinks" }), // sale, green (30% under), coupon
    night(OATS, AS_OF, 3, null, { aisle: "Breakfast" }), // ordinary
    night(SOUP, AS_OF, 3, 2.6, { aisle: "Pantry" }), // on sale, but 30% over its own mean: red
  ];
  const history = [...weeks(COLA, 8, 3.5, 5), ...weeks(OATS, 8, 2.5, 3), ...weeks(SOUP, 8, 2, 2)];
  const rows = board({ products, nights, weeks: history, coupons: [coupon()], couponsStaged: true }).rows;
  const ids = (f: Partial<DealFilter>) => rows.filter((r) => matchesFilter(r, { ...NO_FILTER, ...f })).map((r) => r.productId).sort();

  it("starts with everything", () => {
    expect(ids({})).toEqual([COLA, OATS, SOUP].sort());
  });

  it("On sale, Coupon and Stacks split by what each row has", () => {
    expect(ids({ kind: "sale" })).toEqual([COLA, SOUP].sort());
    expect(ids({ kind: "coupon" })).toEqual([COLA]);
    expect(ids({ kind: "stack" })).toEqual([COLA]);
  });

  it("Green, Neutral and Red filter by colour", () => {
    expect(ids({ light: "green" })).toEqual([COLA]);
    expect(ids({ light: "neutral" })).toEqual([OATS]);
    expect(ids({ light: "red" })).toEqual([SOUP]);
  });

  it("the search reads the name, ignoring case", () => {
    expect(ids({ query: "  HONEY " })).toEqual([OATS]);
    expect(ids({ query: "zzz" })).toEqual([]);
  });

  it("the aisle narrows, and All aisles is everything", () => {
    expect(ids({ aisle: "Drinks" })).toEqual([COLA]);
    expect(ids({ aisle: ALL_AISLES })).toHaveLength(3);
  });

  it("filters combine", () => {
    expect(ids({ kind: "sale", light: "red", aisle: "Pantry" })).toEqual([SOUP]);
    expect(ids({ kind: "sale", light: "green", aisle: "Pantry" })).toEqual([]);
  });

  it("a new product has no colour: it shows under Any and under none of the three", () => {
    const fresh = board({ products, nights, weeks: [] }).rows;
    expect(fresh.every((r) => r.light === "new")).toBe(true);
    for (const light of ["green", "neutral", "red"] as const) {
      expect(fresh.filter((r) => matchesFilter(r, { ...NO_FILTER, light }))).toEqual([]);
    }
    expect(fresh.filter((r) => matchesFilter(r, NO_FILTER))).toHaveLength(3);
  });
});
