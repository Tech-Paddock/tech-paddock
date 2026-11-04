import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Candidate, Plan } from "@/lib/cart";
import { matchOptions, matchView, optionTag, searchHrefFor } from "@/lib/itemMatches";
import type { Product } from "@/lib/kroger";

/** The grocery item popup (TEC-226): which products show, in what order, and the fallback. */

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: "p1",
    upc: "0085631200203",
    url: "https://www.kingsoopers.com/p/fairlife-2-milk/0085631200203",
    count: 0,
    missing: false,
    description: "fairlife 2% Milk",
    size: "52 fl oz",
    sizeFirst: "52 fl oz",
    price: 4.99,
    names: ["milk"],
    ...over,
  };
}

function settle(options: Candidate[]): Plan {
  return { kind: "settle", phrase: "milk", via: "name", options, matched: "milk" };
}

const KROGER_PICK = {
  productId: "0001111041700",
  upc: "0001111041700",
  description: "Kroger 2% Milk",
  size: "1 gal",
  price: 3.49,
  url: "https://www.kingsoopers.com/p/kroger-2-milk/0001111041700",
} as unknown as Product;

describe("matchOptions", () => {
  it("lists the default first, then the most bought, then the plan's own order", () => {
    const plan = settle([
      candidate({ upc: "0000000000001", count: 1, description: "A" }),
      candidate({ upc: "0000000000002", count: 5, description: "B" }),
      candidate({ upc: "0000000000003", count: 0, isDefault: true, description: "C" }),
      candidate({ upc: "0000000000004", count: 5, description: "D" }),
    ]);
    expect(matchOptions(plan).map((o) => o.label)).toEqual(["C", "B", "D", "A"]);
  });

  it("lists a product once, however many times the plan offers it", () => {
    const plan = settle([candidate({ upc: "0000000000001" }), candidate({ upc: "0000000000001" }), candidate({ upc: "0000000000002" })]);
    expect(matchOptions(plan).map((o) => o.upc)).toEqual(["0000000000001", "0000000000002"]);
  });

  it("lists a saved product for a line that goes in without a pick", () => {
    const one = candidate();
    const plan: Plan = {
      kind: "exact",
      upc: one.upc,
      url: one.url,
      phrase: "milk",
      missing: false,
      via: "name",
      option: one,
      chosen: "one",
      options: [one],
      matched: "milk",
    };
    expect(matchOptions(plan)).toHaveLength(1);
  });

  it("offers Kroger's own match when nothing is saved, tagged as its pick", () => {
    const [only] = matchOptions({ kind: "match", product: KROGER_PICK });
    expect(only.label).toBe("Kroger 2% Milk");
    expect(only.detail).toBe("1 gal · $3.49");
    expect(only.tag).toBe("Kroger's pick");
  });

  it("is empty when nothing can be offered", () => {
    expect(matchOptions({ kind: "none", reason: "x" })).toEqual([]);
  });

  it("always links a King Soopers product page, building one when the saved url is not", () => {
    const [o] = matchOptions(settle([candidate({ url: "https://example.com/milk", description: "Whole Milk" })]));
    expect(o.href).toBe("https://www.kingsoopers.com/p/whole-milk/0085631200203");
    const [kept] = matchOptions(settle([candidate()]));
    expect(kept.href).toBe("https://www.kingsoopers.com/p/fairlife-2-milk/0085631200203");
  });
});

describe("optionTag", () => {
  it("words the default, Kroger's pick, bought-N× and new", () => {
    expect(optionTag({ isDefault: true, fresh: false, count: 3 })).toBe("★ bought 3×");
    expect(optionTag({ isDefault: false, fresh: true, count: 0 })).toBe("Kroger's pick");
    expect(optionTag({ isDefault: false, fresh: false, count: 0 })).toBe("new");
  });
});

describe("searchHrefFor", () => {
  it("searches the item alone, never the quantity", () => {
    expect(searchHrefFor("6 cloves of garlic", null, null)).toContain("garlic%20cloves");
  });

  it("searches a phrase's own words", () => {
    expect(searchHrefFor("milk", null, { kind: "terms", name: "milk", terms: "oat milk" } as never)).toContain("oat%20milk");
  });
});

describe("matchView", () => {
  const search = "https://www.kingsoopers.com/search?query=milk";

  it("keeps the search link and says why when there are no matches", () => {
    const v = matchView({ kind: "none", reason: "Kroger has no match at your store." }, search, { ok: true });
    expect(v.options).toEqual([]);
    expect(v.note).toBe("Kroger has no match at your store.");
    expect(v.searchHref).toBe(search);
  });

  it("has no note when there are matches", () => {
    expect(matchView({ kind: "match", product: KROGER_PICK }, search, { ok: true }).note).toBeNull();
  });

  it("not connected: shows the saved product with the reason, plus the search link", () => {
    const v = matchView(settle([candidate()]), search, { ok: false, why: "Connect King Soopers first." });
    expect(v.options).toHaveLength(1);
    expect(v.note).toBe("Connect King Soopers first.");
    expect(v.searchHref).toBe(search);
  });

  it("not connected with nothing saved: no options, the reason and the search link", () => {
    const v = matchView({ kind: "none", reason: "x" }, search, { ok: false, why: "Connect King Soopers first." });
    expect(v.options).toEqual([]);
    expect(v.note).toBe("Connect King Soopers first.");
  });
});

describe("the grocery rows", () => {
  it("open the popup instead of following a link, and the route never writes", () => {
    const list = readFileSync("app/List.tsx", "utf8");
    expect(list).not.toMatch(/href=\{item\.href\}/);
    expect(list.match(/onClick=\{props\.onOpen\}/g)).toHaveLength(2);
    const route = readFileSync("app/api/kroger/matches/route.ts", "utf8");
    expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    expect(route).not.toMatch(/addToCart|rememberProduct|markSent|bumpCounts/);
  });
});
