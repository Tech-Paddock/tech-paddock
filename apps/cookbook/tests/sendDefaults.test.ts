import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decide, defaultFor, defaultPatches, keptDefaults, lineMark, namedAmong, type SavedProduct } from "@/lib/brands";
import { CHECK_RESULTS, planLine, readPicks, reviewLines, sendLines, type CartLine } from "@/lib/cart";
import { searchProducts } from "@/lib/kroger";
import { targetFor } from "@/lib/pricing";
import { linkFor } from "@/lib/preferences";

/**
 * Send to cart with defaults (TEC-135; `RULES.md`, *Send to cart*): Going in,
 * Pick one and Not saved yet; a named product beats the default; the
 * official-name fallback checked against Kroger's own search; nothing skipped
 * but on Not this trip. **Kroger is mocked**: `fetch` is stubbed, and every
 * product and code here is made up — no fixture is real purchase data.
 */

let n = 0;
function product(over: Partial<SavedProduct> = {}): SavedProduct {
  n++;
  const code = over.product_id ?? String(10000000000 + n).padStart(13, "0");
  return {
    id: `p${n}`,
    product_id: code,
    names: ["test muffins"],
    count: 0,
    size_first: null,
    brand: null,
    note: null,
    description: null,
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

/** The candidate a decision puts first: what goes in. */
function first(d: ReturnType<typeof decide>) {
  return d?.kind === "products" ? d.candidates[0] : undefined;
}

function line(over: Partial<CartLine> & { id: string; name: string }): CartLine {
  return { note: null, quantity: 1, sent_at: null, ...over };
}

// Three made-up muffins sharing one name, the most bought first.
const original = () => product({ product_id: "0009990000001", names: ["english muffins"], description: "Test Bakery Original English Muffins", count: 8 });
const raisin = () => product({ product_id: "0009990000002", names: ["english muffins"], description: "Test Bakery Cinnamon Raisin English Muffins", count: 4 });
const sourdough = () => product({ product_id: "0009990000003", names: ["english muffins"], description: "Test Bakery Sourdough English Muffins", count: 1 });

describe("a name's default (TEC-135)", () => {
  it("with no default and nothing else to go on, the count decides (TEC-214)", () => {
    const d = decide("english muffins", [sourdough(), original(), raisin()], []);
    expect(d).toMatchObject({ kind: "products", via: "name", matched: "english muffins", chosen: "bought" });
    expect(d?.kind === "products" && d.candidates.map((c) => c.count)).toEqual([8, 4, 1]);
    expect(lineMark(d)).toBe("★");
  });

  it("with nothing to tell them apart, several products are still Pick one", () => {
    const a = original();
    const b = raisin();
    b.count = a.count;
    const d = decide("english muffins", [a, b], []);
    expect(d).toMatchObject({ kind: "products", chosen: null });
    expect(lineMark(d)).toBe("?");
  });

  it("a line that only says the name goes in as its default", () => {
    const def = raisin();
    def.default_for = ["english muffins"];
    const d = decide("2 English Muffins", [original(), def, sourdough()], []);
    expect(d).toMatchObject({ chosen: "default" });
    expect(first(d)).toMatchObject({ upc: def.product_id, isDefault: true });
    expect(lineMark(d)).toBe("★");
  });

  it("a named product beats the default: sourdough english muffins gets the sourdough", () => {
    const def = original();
    def.default_for = ["english muffins"];
    const sour = sourdough();
    const d = decide("sourdough english muffins", [def, raisin(), sour], []);
    expect(d).toMatchObject({ chosen: "named" });
    expect(first(d)).toMatchObject({ upc: sour.product_id, isDefault: false });
  });

  it("a word every product shares names none of them, so the default still decides", () => {
    const def = original();
    def.default_for = ["english muffins"];
    expect(decide("test bakery english muffins", [def, raisin(), sourdough()], [])).toMatchObject({ chosen: "default" });
  });

  it("names a product without a default too", () => {
    const sour = sourdough();
    const d = decide("english muffins sourdough", [original(), sour], []);
    expect(d).toMatchObject({ chosen: "named" });
    expect(first(d)?.upc).toBe(sour.product_id);
  });

  it("two claims on one name read as no default — the next step decides, never a claim", () => {
    const a = original();
    const b = raisin();
    a.default_for = ["english muffins"];
    b.default_for = ["english muffins"];
    expect(defaultFor("english muffins", [a, b])).toBeNull();
    expect(decide("english muffins", [a, b], [])).toMatchObject({ chosen: "bought" });
    b.count = a.count;
    expect(decide("english muffins", [a, b], [])).toMatchObject({ chosen: null });
  });

  it("a default for a name the row no longer carries is ignored", () => {
    const a = original();
    a.names = ["muffins"];
    a.default_for = ["english muffins"];
    expect(defaultFor("english muffins", [a, raisin()])).toBeNull();
  });

  it("Make default moves the name to one product and takes it off the others", () => {
    const a = original();
    const b = raisin();
    a.default_for = ["english muffins"];
    const r = defaultPatches([a, b], ["English  Muffins"], b.product_id);
    expect(r).toEqual({ patches: [{ id: a.id, default_for: [] }, { id: b.id, default_for: ["english muffins"] }] });
  });

  it("Make default refuses a name the product does not carry, or a product not saved", () => {
    const a = original();
    expect(defaultPatches([a], ["bagels"], a.product_id)).toMatchObject({ error: expect.stringContaining("isn't one of its names") });
    expect(defaultPatches([a], ["english muffins"], "0009990009999")).toMatchObject({ error: expect.any(String) });
  });

  it("an edit that drops a name drops its default", () => {
    expect(keptDefaults(["english muffins", "muffins"], ["Muffins"])).toEqual(["muffins"]);
  });

  it("the estimate prices, and the list links to, the product Send would add", () => {
    const def = raisin();
    def.default_for = ["english muffins"];
    const d = decide("english muffins", [original(), def], []);
    expect(targetFor("english muffins", d)).toEqual({ kind: "id", productId: def.product_id });
    expect(linkFor("english muffins", d).href).toBe(def.url);
  });

  it("namedAmong needs words beyond the name that fit exactly one product", () => {
    const all = [original(), raisin(), sourdough()];
    expect(namedAmong("english muffins", "english muffins", all)).toBeNull();
    expect(namedAmong("cinnamon raisin english muffins", "english muffins", all)?.product_id).toBe("0009990000002");
    expect(namedAmong("blueberry english muffins", "english muffins", all)).toBeNull();
  });
});

describe("what Send plans, with defaults (TEC-135)", () => {
  const noSearch = vi.fn(async () => []);

  it("a default is Going in, with every option a tap away", async () => {
    const def = raisin();
    def.default_for = ["english muffins"];
    const products = [original(), def];
    const plan = await planLine(line({ id: "a", name: "english muffins" }), (x) => decide(x, products, []), noSearch);
    expect(plan).toMatchObject({ kind: "exact", chosen: "default", upc: def.product_id, matched: "english muffins" });
    expect(plan.kind === "exact" && plan.options.map((o) => o.upc)).toEqual([def.product_id, "0009990000001"]);
    expect(noSearch).not.toHaveBeenCalled();
  });

  it("several and no default, with different counts, is Going in as the most counted (TEC-214)", async () => {
    const products = [original(), raisin()];
    const plan = await planLine(line({ id: "a", name: "english muffins" }), (x) => decide(x, products, []), noSearch);
    expect(plan).toMatchObject({ kind: "exact", chosen: "bought", upc: "0009990000001", options: [{ count: 8 }, { count: 4 }] });
  });

  it("several that nothing tells apart are Pick one", async () => {
    const a = original();
    const b = raisin();
    b.count = a.count;
    const plan = await planLine(line({ id: "a", name: "english muffins" }), (x) => decide(x, [a, b], []), noSearch);
    expect(plan).toMatchObject({ kind: "settle", matched: "english muffins" });
  });
});

// ---------------------------------------------------------------------------
// The official-name fallback, checked against Kroger (TEC-135)
// ---------------------------------------------------------------------------

/** A made-up Kroger product row, as the Products API returns it. */
function kroger(code: string, description: string) {
  return { productId: code, upc: code, description, brand: "Test", items: [{ size: "16 oz", price: { regular: 1.99 } }] };
}

/** Kroger's search, mocked: each term returns these rows. */
function stubSearch(results: Record<string, ReturnType<typeof kroger>[]>) {
  const seen: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      const term = url.searchParams.get("filter.term") ?? "";
      seen.push(`${term}|${url.searchParams.get("filter.limit")}`);
      return new Response(JSON.stringify({ data: results[term] ?? [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    })
  );
  return seen;
}

const search = (term: string) => searchProducts("test-token", term, "62000001", CHECK_RESULTS);

describe("the official-name fallback is checked against Kroger's own search (TEC-135)", () => {
  afterEach(() => vi.unstubAllGlobals());

  // Saved under other names, so only their Kroger names could match.
  const sauce = () => product({ product_id: "0009990000101", names: ["pasta sauce"], description: "Test Brand Spaghetti Pasta Sauce" });
  const caramels = () => product({ product_id: "0009990000102", names: ["caramels"], description: "Test Brand Sea Salt Caramels" });

  it('"8 oz spaghetti" never offers the pasta sauce: Kroger\'s search for spaghetti does not return it', async () => {
    const seen = stubSearch({
      spaghetti: [kroger("0009990000201", "Test Brand Spaghetti"), kroger("0009990000202", "Test Brand Thin Spaghetti")],
    });
    const products = [sauce(), caramels()];
    // The fallback alone would offer it…
    expect(decide("8 oz spaghetti", products, [])).toMatchObject({ via: "description", candidates: [{ upc: "0009990000101" }] });
    // …and the check refuses it: Not saved yet, with Kroger's top match.
    const [reviewed] = await reviewLines([line({ id: "a", name: "8 oz spaghetti" })], (x) => decide(x, products, []), search);
    expect(reviewed.plan).toMatchObject({ kind: "match", product: { upc: "0009990000201", description: "Test Brand Spaghetti" } });
    expect(seen).toEqual([`spaghetti|${CHECK_RESULTS}`]);
  });

  it('"1 tsp salt" never offers the sea-salt caramels', async () => {
    stubSearch({ salt: [kroger("0009990000301", "Test Brand Iodized Salt"), kroger("0009990000302", "Test Brand Kosher Salt")] });
    const products = [sauce(), caramels()];
    expect(decide("1 tsp salt", products, [])).toMatchObject({ via: "description", candidates: [{ upc: "0009990000102" }] });
    const [reviewed] = await reviewLines([line({ id: "a", name: "1 tsp salt" })], (x) => decide(x, products, []), search);
    expect(reviewed.plan).toMatchObject({ kind: "match", product: { upc: "0009990000301" } });
  });

  it("a saved product Kroger's search does return goes in", async () => {
    const pasta = product({ product_id: "0009990000201", names: ["noodles"], description: "Test Brand Spaghetti" });
    stubSearch({ spaghetti: [kroger("0009990000202", "Test Brand Thin Spaghetti"), kroger("0009990000201", "Test Brand Spaghetti")] });
    const products = [pasta, sauce()];
    const [reviewed] = await reviewLines([line({ id: "a", name: "8 oz spaghetti" })], (x) => decide(x, products, []), search);
    expect(reviewed.plan).toMatchObject({ kind: "exact", upc: "0009990000201", via: "description", chosen: "one" });
  });

  it("with nothing returned at all, the line says Kroger has no match", async () => {
    stubSearch({});
    const [reviewed] = await reviewLines([line({ id: "a", name: "8 oz spaghetti" })], (x) => decide(x, [sauce()], []), search);
    expect(reviewed.plan).toMatchObject({ kind: "none" });
  });

  it("before Send checks it, the list marks it + and the estimate prices Kroger's match for the item", () => {
    const d = decide("8 oz spaghetti", [sauce()], []);
    expect(lineMark(d)).toBe("+");
    expect(targetFor("8 oz spaghetti", d)).toEqual({ kind: "term", term: "spaghetti" });
    expect(linkFor("8 oz spaghetti", d).href).not.toContain("0009990000101");
  });
});

// ---------------------------------------------------------------------------
// The send: Make default, and Not this trip
// ---------------------------------------------------------------------------

describe("a send never sets a default, and Not this trip (TEC-135, TEC-214)", () => {
  const PAGE = "https://www.kingsoopers.com/p/test/0009990000002";

  it("drops a Make default tick from a pick: the request cannot ask for one", () => {
    const ask = { id: "a", upc: "0009990000002", match: PAGE, makeDefault: true };
    expect(readPicks([ask])).toEqual([{ id: "a", upc: "0009990000002", match: PAGE }]);
    expect(readPicks([{ id: "a", url: PAGE, makeDefault: true }])).toEqual([{ id: "a", url: PAGE }]);
  });

  it("a send adds and remembers, and sets no default even when a pick asks", async () => {
    const calls: string[] = [];
    const picks = readPicks([{ id: "a", upc: "0009990000002", match: PAGE, makeDefault: true }]);
    const outcomes = await sendLines(
      { open: [line({ id: "a", name: "english muffins" })], picks, again: false },
      {
        add: async () => void calls.push("add"),
        remember: async () => void calls.push("remember"),
        // A stray hook is never called: the deps have no place for one.
        ...({ makeDefault: async () => void calls.push("default") } as object),
      }
    );
    expect(calls).toEqual(["add", "remember"]);
    expect(outcomes[0].detail).not.toMatch(/default/i);
  });

  it("nothing in the send path, the route or the splash can set a default", () => {
    for (const file of ["../app/api/kroger/cart/route.ts", "../lib/cart.ts", "../lib/cartGuess.ts", "../app/Cart.tsx"]) {
      expect(readFileSync(resolve(__dirname, file), "utf8")).not.toMatch(/setDefault|makeDefault|defaultNames/);
    }
  });

  it("a line left out is Not this trip, and says it is still on the list", async () => {
    const outcomes = await sendLines(
      { open: [line({ id: "a", name: "english muffins" }), line({ id: "b", name: "milk" })], picks: [{ id: "b", upc: "0009990000009" }], again: false },
      { add: async () => {}, remember: async () => {} }
    );
    expect(outcomes.find((o) => o.id === "a")).toMatchObject({ result: "skipped", detail: "Not this trip — still on your list." });
  });
});
