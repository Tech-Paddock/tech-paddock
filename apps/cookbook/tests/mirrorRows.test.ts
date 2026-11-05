import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * In cart mirrors the List (TEC-227; owner, 2026-11-04: "With the list conversion shopping list
 * creates a mirror grayed out item in cart. Adding it one off or the entire list switches them to
 * live."). Kroger is mocked and every product and code is made up.
 */

const A = "0004900000001";
const B = "0004900000002";
const SENT = "0004900000009";

const mem = vi.hoisted(() => ({
  list: [] as Record<string, unknown>[],
  sends: [] as Record<string, unknown>[],
  connected: true,
  searches: [] as string[],
  searchResult: [] as Record<string, unknown>[],
  searchFails: false,
}));

const saved = (upc: string, over: Record<string, unknown> = {}) => ({
  id: `id-${upc}`,
  product_id: upc,
  names: ["coke"],
  count: 0,
  size_first: null,
  brand: null,
  note: null,
  description: `Coke ${upc}`,
  kroger_brand: null,
  size: "12 oz",
  url: null,
  price: 7.5,
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
});

vi.mock("@/lib/grocery", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/grocery")>()), readList: async () => mem.list }));
vi.mock("@/lib/preferences", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/preferences")>()), readPreferences: async () => [] }));
vi.mock("@/lib/purchaseStore", () => ({ purchasesForPicking: async () => new Map() }));
vi.mock("@/lib/productStore", () => ({
  readProducts: async () => [
    saved(A, { names: ["coke"], default_for: ["coke"], description: "Coke Classic" }),
    saved(B, { names: ["coke"], description: "Coke Zero" }),
    saved(SENT, { names: ["tea"], description: "Sweet Tea", size: "1 gal", price: 3 }),
    saved("0004900000010", { names: ["oat milk"], description: "Oat Milk" }),
    saved("0004900000011", { names: ["oat milk"], description: "Oat Milk Barista" }),
  ],
}));
vi.mock("@/lib/krogerStore", () => ({ readConnectionRow: async () => ({ location_id: null, store_name: null }) }));
vi.mock("@/lib/priceStore", () => ({ readNightsSince: async () => [], readWeeksSince: async () => [] }));
vi.mock("@/lib/couponStore", () => ({ readCoupons: async () => ({ coupons: [] }) }));
vi.mock("@/lib/cartSends", () => ({ readSends: async () => mem.sends }));
vi.mock("@/lib/krogerConnection", () => ({
  withAccessToken: async (use: (token: string, store: { locationId: string; name: string } | null, modality: string) => Promise<unknown>) => {
    if (!mem.connected) throw new Error("Connect King Soopers first.");
    return use("token", { locationId: "62000001", name: "Test" }, "PICKUP");
  },
}));
vi.mock("@/lib/kroger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/kroger")>()),
  searchProducts: async (_token: string, term: string) => {
    mem.searches.push(term);
    if (mem.searchFails) throw new Error("Kroger is down");
    return mem.searchResult;
  },
}));

import { GET as mirrorGet } from "@/app/api/kroger/mirror/route";
import { GET as groceryGet } from "@/app/api/grocery/route";
import { GreyRow, InCartRow } from "@/app/List";
import { mirrorLines, mirrorOf } from "@/lib/mirror";
import { cartSplit, greyTotal, greyWords, productWords, type MirrorRow } from "@/lib/mirrorWords";
import { totalsOf } from "@/lib/listPrices";
import { NextRequest } from "next/server";

const line = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  note: null,
  source: "manual",
  checked: false,
  created_at: "2026-11-01T00:00:00Z",
  recipes: [],
  quantity: 1,
  sent_at: null,
  ...over,
});

const krogerCola = { productId: "0001111000077", upc: "0001111000077", description: "Kroger Cola", brand: null, size: "2 L", price: 2.5, regular: 2.5, promo: null, promoEnds: null, pickup: true, delivery: true, inStock: true, url: "https://www.kingsoopers.com/p/kroger-cola/0001111000077", aisle: null };

const get = (query = "") => mirrorGet(new NextRequest(`http://localhost/api/kroger/mirror${query}`));
const rows = async (query = "") => ((await (await get(query)).json()).rows as MirrorRow[]);

beforeEach(() => {
  mem.list = [];
  mem.sends = [];
  mem.connected = true;
  mem.searches = [];
  mem.searchResult = [krogerCola];
  mem.searchFails = false;
});

describe("what a grey row shows", () => {
  it("is the exact product a send would put in the cart, by the same picking: your pick, then the default", async () => {
    mem.list = [line("1", "coke"), line("2", "coke", { picked: { upc: B, url: `https://www.kingsoopers.com/p/x/${B}`, label: "Coke Zero", size: "12 oz", price: 7.5 } })];
    const got = await rows();
    expect(got.find((r) => r.id === "1")).toMatchObject({ state: "product", upc: A, label: "Coke Classic" });
    expect(got.find((r) => r.id === "2")).toMatchObject({ state: "product", upc: B, label: "Coke Zero" });
    // Both settled by Your brands: Kroger was not asked.
    expect(mem.searches).toEqual([]);
  });

  it("is Kroger's top match when nothing is saved", async () => {
    mem.list = [line("1", "cola zero")];
    expect(await rows()).toEqual([{ id: "1", state: "product", upc: "0001111000077", label: "Kroger Cola", size: "2 L", price: 2.5 }]);
    expect(mem.searches).toHaveLength(1);
  });

  it("reads '<word> — pick one' when there is no clear match: Kroger has none, or several saved products and nothing separates them", async () => {
    mem.searchResult = [];
    mem.list = [line("1", "zzz"), line("2", "oat milk")];
    const got = await rows();
    expect(got).toEqual([
      { id: "1", state: "pick-one" },
      { id: "2", state: "pick-one" },
    ]);
    expect(greyWords("zzz", got[0])).toBe("zzz — pick one");
  });

  it("words the product as its name and size, once", () => {
    expect(productWords("Coke Zero", "12 oz")).toBe("Coke Zero 12 oz");
    expect(productWords("Coke Zero 12 oz", "12 oz")).toBe("Coke Zero 12 oz");
    expect(productWords("Coke Zero", null)).toBe("Coke Zero");
    expect(greyWords("coke", { id: "1", state: "product", upc: A, label: "Coke Zero", size: "12 oz", price: 1 })).toBe("Coke Zero 12 oz");
  });
});

describe("resolving the grey rows is cheap and never blocks the list", () => {
  it("asks Kroger only for the lines Your brands cannot settle, once, for the whole batch", async () => {
    mem.list = [line("1", "coke"), line("2", "cola zero"), line("3", "kale"), line("4", "tea")];
    const got = await rows();
    expect(got).toHaveLength(4);
    expect(mem.searches.sort()).toEqual(["cola zero", "kale"]);
  });

  it("a failed Kroger search degrades those lines to the plain word (unknown) and keeps the rest", async () => {
    mem.searchFails = true;
    mem.list = [line("1", "coke"), line("2", "kale")];
    const res = await get();
    expect(res.status).toBe(200);
    const got = ((await res.json()).rows as MirrorRow[]);
    expect(got.find((r) => r.id === "1")?.state).toBe("product");
    expect(got.find((r) => r.id === "2")?.state).toBe("unknown");
    expect(greyWords("kale", got.find((r) => r.id === "2"))).toBe("kale");
  });

  it("not connected: saved lines still resolve, the rest read the word, and the request is still a 200", async () => {
    mem.connected = false;
    mem.list = [line("1", "coke"), line("2", "kale")];
    const res = await get();
    expect(res.status).toBe(200);
    const got = ((await res.json()).rows as MirrorRow[]);
    expect(got.map((r) => r.state)).toEqual(["product", "unknown"]);
    expect(mem.searches).toEqual([]);
  });

  it("resolves at most four searches at a time", async () => {
    let live = 0;
    let peak = 0;
    const search = async () => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 2));
      live--;
      return [krogerCola] as never;
    };
    const lines = Array.from({ length: 12 }, (_, i) => ({ id: `l${i}`, name: `thing ${i}`, note: null, quantity: 1, sent_at: null }));
    const out = await mirrorLines(lines, () => null, search);
    expect(out).toHaveLength(12);
    expect(peak).toBeLessThanOrEqual(4);
  });

  it("limits a request to its ids, skips ticked and sent lines, and caps a batch", async () => {
    mem.list = [line("1", "coke"), line("2", "coke", { checked: true }), line("3", "coke", { sent_at: "2026-11-02T00:00:00Z" }), line("4", "tea")];
    expect((await rows()).map((r) => r.id)).toEqual(["1", "4"]);
    expect((await rows("?ids=4")).map((r) => r.id)).toEqual(["4"]);
    mem.list = Array.from({ length: 45 }, (_, i) => line(`m${i}`, "coke"));
    expect(await rows()).toHaveLength(30);
  });

  it("is read-only: it never adds to the cart, remembers a product or writes a default", async () => {
    const { readFileSync } = await import("node:fs");
    const route = readFileSync(new URL("../app/api/kroger/mirror/route.ts", import.meta.url), "utf8");
    expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    expect(route).not.toMatch(/addToCart|rememberProduct|markSent|bumpCounts|setPicked/);
  });

  it("the page asks inside serialKroger, in batches, with no per-line request", async () => {
    const { readFileSync } = await import("node:fs");
    const hook = readFileSync(new URL("../app/useMirror.ts", import.meta.url), "utf8");
    expect(hook).toMatch(/serialKroger\(\(\) => fetch\(`\/api\/kroger\/mirror\?ids=/);
    expect(hook).toMatch(/i \+= MIRROR_MAX/);
  });
});

describe("grey rows are not in the cart", () => {
  const items = [
    { id: "1", sent_at: "2026-11-02T00:00:00Z", checked: false, price: { total: 5 } },
    { id: "2", sent_at: null, checked: false, price: { total: 7.5 } },
    { id: "3", sent_at: null, checked: true, price: { total: 100 } },
  ];

  it("In cart counts and totals only the live rows; a ticked line is neither", () => {
    const { live, grey } = cartSplit(items);
    expect(live.map((i) => i.id)).toEqual(["1"]);
    expect(grey.map((i) => i.id)).toEqual(["2"]);
    expect(totalsOf(live.map((i) => i.price as never)).total).toBe(5);
  });

  it("sending a line turns its grey row live: it moves from grey to live and the live total includes it", () => {
    const sent = items.map((i) => (i.id === "2" ? { ...i, sent_at: "2026-11-05T00:00:00Z" } : i));
    const { live, grey } = cartSplit(sent);
    expect(grey).toHaveLength(0);
    expect(live.map((i) => i.id)).toEqual(["1", "2"]);
    expect(totalsOf(live.map((i) => i.price as never)).total).toBe(12.5);
  });

  it("the page counts In cart from the live rows only", async () => {
    const { readFileSync } = await import("node:fs");
    const list = readFileSync(new URL("../app/List.tsx", import.meta.url), "utf8");
    expect(list).toMatch(/const inCart = cartSplit\(all\)\.live/);
    expect(list).toMatch(/In cart · \{inCart\.length\}/);
    expect(list).not.toMatch(/In cart · \{[^}]*greyed/);
  });
});

describe("the grey row", () => {
  const item = (over: Record<string, unknown> = {}) => ({ ...line("1", "coke", { quantity: 2 }), view: { name: "coke", amount: null, note: null }, price: null, ...over }) as never;
  const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const product: MirrorRow = { id: "1", state: "product", upc: B, label: "Coke Zero", size: "12 oz", price: 3.5 };

  it("shows the product, the quantity and its price (the product's price times how many), greyed, and says it is not sent yet", () => {
    const html = renderToStaticMarkup(createElement(GreyRow, { item: item(), row: product }));
    expect(text(html)).toContain("Coke Zero 12 oz");
    expect(text(html)).toContain("×2");
    expect(text(html)).toContain("$7.00");
    expect(html).toContain("opacity-60");
    expect(html).toContain("Not sent yet");
    expect(html).not.toContain("<button");
  });

  it("prefers the line's nightly price, and says 'no price yet' rather than $0", () => {
    expect(text(renderToStaticMarkup(createElement(GreyRow, { item: item({ price: { total: 9.99 } }), row: product })))).toContain("$9.99");
    const none = text(renderToStaticMarkup(createElement(GreyRow, { item: item(), row: { id: "1", state: "pick-one" } })));
    expect(none).toContain("coke — pick one");
    expect(none).toContain("no price yet");
    expect(none).not.toContain("$0");
    expect(greyTotal(null, 2, null)).toBeNull();
  });

  it("reads the plain word while it is being worked out, and when it could not be", () => {
    expect(text(renderToStaticMarkup(createElement(GreyRow, { item: item(), row: null })))).toContain("coke");
    expect(text(renderToStaticMarkup(createElement(GreyRow, { item: item(), row: { id: "1", state: "unknown" } })))).not.toContain("pick one");
  });

  it("a live In cart row is not greyed", () => {
    const html = renderToStaticMarkup(createElement(InCartRow, { item: item({ sent_at: "2026-11-02T00:00:00Z", used: { product: "Coke Zero", size: "12 oz" } }), live: null, disabled: false, returning: false, onBack: () => undefined }));
    expect(html).not.toContain("opacity-60");
    expect(text(html)).toContain("Coke Zero 12 oz");
  });
});

describe("In cart rows show the product that was sent", () => {
  it("GET /api/grocery joins the ledger's latest product to Your brands, and a line with no ledger row has none", async () => {
    mem.list = [line("1", "tea", { sent_at: "2026-11-02T00:00:00Z" }), line("2", "coke", { sent_at: "2026-11-02T00:00:00Z" }), line("3", "coke")];
    mem.sends = [
      { item_id: "1", name: "tea", kind: "sent", upc: A, quantity: 1, modality: null },
      { item_id: "1", name: "tea", kind: "sent", upc: SENT, quantity: 1, modality: null },
    ];
    const { items } = await (await groceryGet()).json();
    const by = (id: string) => items.find((i: { id: string }) => i.id === id);
    // The most recent send wins, joined to its saved product.
    expect(by("1").used).toEqual({ product: "Sweet Tea", size: "1 gal" });
    expect(by("2").used).toBeNull();
    expect(by("3").used).toBeNull();
  });

  it("a pick that Your brands does not hold yet is what a sent line reads", async () => {
    const picked = { upc: "0001111000077", url: "https://www.kingsoopers.com/p/kroger-cola/0001111000077", label: "Kroger Cola", size: "2 L", price: 2.5 };
    mem.list = [line("1", "cola", { sent_at: "2026-11-02T00:00:00Z", picked: picked })];
    mem.sends = [{ item_id: "1", name: "cola", kind: "sent", upc: picked.upc, quantity: 1, modality: null }];
    const { items } = await (await groceryGet()).json();
    expect(items[0].used).toEqual({ product: "Kroger Cola", size: "2 L" });
  });

  it("mirrorOf words a plan's product", () => {
    expect(mirrorOf("1", { kind: "none", reason: "x" })).toEqual({ id: "1", state: "pick-one" });
  });
});
