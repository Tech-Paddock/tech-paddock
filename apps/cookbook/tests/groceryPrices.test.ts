import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `GET /api/grocery` carries each line's price from the nightly check
 * (TEC-190): no Kroger call, a missing price is `null` ("no price yet"), never
 * $0, and a failed price read is said without losing the list. Made-up data.
 */

const MILK = "0001111041700";
const mem = vi.hoisted(() => ({
  list: [] as Record<string, unknown>[],
  nights: [] as Record<string, unknown>[],
  failNights: false,
  store: true,
}));

vi.mock("@/lib/grocery", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/grocery")>()), readList: async () => mem.list }));
vi.mock("@/lib/preferences", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/preferences")>()), readPreferences: async () => [] }));
vi.mock("@/lib/productStore", () => ({
  readProducts: async () => [
    {
      id: "p1",
      product_id: MILK,
      names: ["milk"],
      count: 1,
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
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    },
  ],
}));
vi.mock("@/lib/krogerStore", () => ({
  readConnectionRow: async () => (mem.store ? { location_id: "62000001", store_name: "King Soopers Test" } : { location_id: null, store_name: null }),
}));
vi.mock("@/lib/priceStore", () => ({
  readNightsSince: async () => {
    if (mem.failNights) throw new Error("Couldn't read the nightly prices: down");
    return mem.nights;
  },
}));

const line = (id: string, name: string, quantity = 1, over: Record<string, unknown> = {}) => ({
  id,
  name,
  note: null,
  source: "manual",
  checked: false,
  created_at: "2026-10-20T00:00:00Z",
  recipes: [],
  quantity,
  sent_at: null,
  ...over,
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("no network in this test", { status: 500 })));
  mem.store = true;
  mem.failNights = false;
  mem.list = [line("a", "milk", 2), line("b", "saffron"), line("c", "5 onions")];
  mem.nights = [
    { product_id: MILK, location_id: "62000001", night: "2026-10-27", regular: 4, sale: null, in_stock: true, aisle: null },
    { product_id: MILK, location_id: "62000001", night: "2026-10-28", regular: 4, sale: 3.25, in_stock: true, aisle: null },
  ];
});

describe("GET /api/grocery prices", () => {
  it("prices a line from its saved product's latest night, sale first, times the quantity; others are null, never 0", async () => {
    const { GET } = await import("@/app/api/grocery/route");
    const body = await (await GET()).json();
    expect(body.store).toBe("King Soopers Test");
    expect(body.priceError).toBeNull();
    const by = (id: string) => body.items.find((i: { id: string }) => i.id === id);
    expect(by("a").price).toEqual({ unit: 3.25, total: 6.5, onSale: true, night: "2026-10-28" });
    expect(by("b").price).toBeNull();
    // The bag line is shown as the bag, counted as one, and has no saved product, so no price yet.
    expect(by("c").view).toMatchObject({ name: "Onions, 3 lb bag", amount: "was 5 onions" });
    expect(by("c").price).toBeNull();
    // The stored line is untouched.
    expect(by("c").name).toBe("5 onions");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a failed price read is said and the list still comes back, unpriced", async () => {
    mem.failNights = true;
    const { GET } = await import("@/app/api/grocery/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.priceError).toMatch(/nightly prices/);
    expect(body.items).toHaveLength(3);
    expect(body.items.every((i: { price: unknown }) => i.price === null)).toBe(true);
  });

  it("without a store there are no prices and no error", async () => {
    mem.store = false;
    const { GET } = await import("@/app/api/grocery/route");
    const body = await (await GET()).json();
    expect(body.store).toBeNull();
    expect(body.priceError).toBeNull();
    expect(body.items.every((i: { price: unknown }) => i.price === null)).toBe(true);
  });
});
