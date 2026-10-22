import { describe, expect, it } from "vitest";
import {
  codeOf,
  countBumps,
  decide,
  placeProduct,
  readNames,
  readProductDraft,
  rememberPlacement,
  successorPatch,
  type SavedProduct,
  type WordRow,
} from "@/lib/brands";

/**
 * Your brands, one row per King Soopers product code (TEC-131; `RULES.md`,
 * *Storage* and *Send to cart*). Pure rules; no database, no Kroger. Every
 * product here is made up.
 */

let n = 0;
function product(over: Partial<SavedProduct> = {}): SavedProduct {
  n++;
  const code = over.product_id ?? String(10000000000 + n).padStart(13, "0");
  return {
    id: `p${n}`,
    product_id: code,
    names: ["test cola"],
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
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

function words(phrase: string, terms: string, over: Partial<WordRow> = {}): WordRow {
  return { id: phrase, phrase, kind: "terms", terms, updated_at: "2026-10-01T00:00:00Z", ...over };
}

describe("which products decide a line", () => {
  it("a line that is a product code is that exact product, saved or not", () => {
    const saved = product({ product_id: "0001111000001", names: ["test oats"] });
    expect(decide("0001111000001", [saved], [])).toMatchObject({ kind: "products", via: "code", candidates: [{ id: saved.id, upc: "0001111000001" }] });
    const unsaved = decide("0001111000099", [saved], []);
    expect(unsaved).toMatchObject({ kind: "products", via: "code", candidates: [{ id: null, upc: "0001111000099" }] });
    expect(unsaved?.kind === "products" && unsaved.candidates[0].url).toMatch(/\/0001111000099$/);
  });

  it("a name matches as whole words, so milk is not buttermilk", () => {
    const milk = product({ names: ["milk"] });
    expect(decide("1 cup buttermilk", [milk], [])).toBeNull();
    expect(decide("2 cups milk", [milk], [])).toMatchObject({ kind: "products", via: "name" });
  });

  it("every name on the row counts: coke, coke zero and 12 pack coke zero are one product", () => {
    const coke = product({ names: ["coke", "coke zero", "12 pack coke zero"] });
    for (const line of ["coke", "Coke Zero", "12 pack coke zero"]) {
      expect(decide(line, [coke], [])).toMatchObject({ kind: "products", candidates: [{ id: coke.id }] });
    }
  });

  it("the longest matching name decides: whole milk overrides milk", () => {
    const milk = product({ names: ["milk"] });
    const whole = product({ names: ["whole milk"] });
    expect(decide("1 gal whole milk", [milk, whole], [])).toMatchObject({ candidates: [{ id: whole.id }] });
  });

  it("a name on several products is Settle these, most counted first, then most recently updated", () => {
    const a = product({ names: ["test cereal"], count: 2, updated_at: "2026-10-05T00:00:00Z" });
    const b = product({ names: ["test cereal"], count: 9 });
    const c = product({ names: ["test cereal"], count: 2, updated_at: "2026-10-09T00:00:00Z" });
    const d = decide("test cereal", [a, b, c], []);
    expect(d?.kind === "products" && d.candidates.map((x) => x.id)).toEqual([b.id, c.id, a.id]);
  });

  it("search words with a longer phrase decide instead; on the same length, products win", () => {
    const milk = product({ names: ["milk"] });
    expect(decide("oat milk", [milk], [words("oat milk", "test oat milk")])).toEqual({ kind: "terms", phrase: "oat milk", terms: "test oat milk" });
    expect(decide("milk", [milk], [words("milk", "test milk")])).toMatchObject({ kind: "products" });
    expect(decide("bread", [milk], [words("bread", "test bread")])).toMatchObject({ kind: "terms" });
  });

  it("an old plain phrase still decides, as a plain search", () => {
    expect(decide("whole milk", [], [words("whole milk", "", { kind: "plain", terms: null })])).toEqual({ kind: "plain", phrase: "whole milk" });
  });

  it("only when no name matched: the item alone against the official Kroger name", () => {
    const garlic = product({ names: ["test garlic"], description: "Fresh Peeled Garlic Cloves", count: 1 });
    const minced = product({ names: ["jarred garlic"], description: "Minced Garlic in Water" });
    expect(decide("6 cloves of garlic", [garlic, minced], [])).toMatchObject({ kind: "products", via: "description", candidates: [{ id: garlic.id }] });
    // Several hits are Settle these, most counted first.
    const both = decide("garlic, thinly sliced", [minced, garlic], []);
    expect(both?.kind === "products" && both.candidates.map((x) => x.id)).toEqual([garlic.id, minced.id]);
    // A saved name wins over any description.
    const named = product({ names: ["garlic"] });
    expect(decide("6 cloves of garlic", [garlic, minced, named], [])).toMatchObject({ via: "name", candidates: [{ id: named.id }] });
  });

  it("no opinion is null, not a guess", () => {
    expect(decide("saffron", [product({ names: ["milk"], description: "Kroger 2% Milk" })], [])).toBeNull();
  });

  it("a candidate carries the product's pack conversion", () => {
    const garlic = product({ names: ["garlic"], pack_label: "Heads of Garlic", pack_size: 10, pack_unit: "cloves" });
    expect(decide("garlic", [garlic], [])).toMatchObject({ candidates: [{ pack: { label: "Heads of Garlic", size: 10, unit: "cloves" } }] });
  });
});

describe("names and codes", () => {
  it("names come as a list or one comma-separated field, trimmed, without repeats", () => {
    expect(readNames(" coke , Coke Zero,  coke ,, 12  pack coke zero")).toEqual(["coke", "Coke Zero", "12 pack coke zero"]);
    expect(readNames(["a", "A"])).toEqual(["a"]);
    expect(readNames([])).toEqual({ error: "needs at least one name" });
    expect(readNames(5)).toEqual({ error: "names must be a list of words" });
  });

  it("a code is 8–14 digits as text, or a King Soopers product page's digits", () => {
    expect(codeOf("0001111041700")).toBe("0001111041700");
    expect(codeOf("https://www.kingsoopers.com/p/test/0001111041700")).toBe("0001111041700");
    expect(codeOf(1111041700)).toMatchObject({ error: expect.stringMatching(/leading zeros/) });
    expect(codeOf("milk")).toMatchObject({ error: expect.stringMatching(/isn't a product code/) });
  });

  it("a draft keeps the page it came with, and leaves out what was not sent", () => {
    const read = readProductDraft({ product: "https://www.kingsoopers.com/p/test/0001111041700", names: "milk" });
    expect(read).toEqual({ draft: { product_id: "0001111041700", names: ["milk"], url: "https://www.kingsoopers.com/p/test/0001111041700" } });
  });

  it("a pack conversion needs its size and unit together, and a size above 0", () => {
    expect(readProductDraft({ product: "0001111041700", names: ["garlic"], pack_label: "Heads of Garlic", pack_size: 10, pack_unit: "cloves" })).toMatchObject({
      draft: { pack_label: "Heads of Garlic", pack_size: 10, pack_unit: "cloves" },
    });
    expect(readProductDraft({ product: "0001111041700", names: ["garlic"], pack_size: 10 })).toMatchObject({ error: expect.stringMatching(/both/) });
    expect(readProductDraft({ product: "0001111041700", names: ["garlic"], pack_size: 0, pack_unit: "cloves" })).toMatchObject({ error: expect.stringMatching(/above 0/) });
    expect(readProductDraft({ product: "0001111041700", names: ["garlic"], pack_size: null, pack_unit: null })).toMatchObject({ draft: { pack_size: null, pack_unit: null } });
  });

  it("a count is a whole number, 0 or more", () => {
    expect(readProductDraft({ product: "0001111041700", names: ["x"], count: -1 })).toMatchObject({ error: expect.stringMatching(/whole number/) });
    expect(readProductDraft({ product: "0001111041700", names: ["x"], count: 1.5 })).toMatchObject({ error: expect.stringMatching(/whole number/) });
  });
});

describe("a product code is never saved twice", () => {
  const saved = product({ product_id: "0001111000001", names: ["test tea"] });
  const other = product({ product_id: "0001111000002", names: ["test coffee"] });

  it("a new draft for a saved code lands on that row", () => {
    expect(placeProduct({ product_id: "0001111000001", names: ["tea"] }, [saved, other])).toEqual({ action: "update", existing: saved });
    expect(placeProduct({ product_id: "0001111000003", names: ["tea"] }, [saved, other])).toEqual({ action: "insert" });
  });

  it("the editor cannot move a row onto another row's code", () => {
    expect(placeProduct({ product_id: "0001111000002", names: ["tea"] }, [saved, other], saved.id)).toMatchObject({ error: expect.stringMatching(/test coffee/) });
    expect(placeProduct({ product_id: "0001111000001", names: ["tea"] }, [saved, other], saved.id)).toEqual({ action: "update", existing: saved });
  });
});

describe("remembering what went in", () => {
  const saved = product({ product_id: "0001111000001", names: ["test tea"] });

  it("adds the line's name to that product, or does nothing when it is already there", () => {
    expect(rememberPlacement([saved], "Green Tea", "0001111000001")).toEqual({ action: "add-name", id: saved.id, names: ["test tea", "Green Tea"] });
    expect(rememberPlacement([saved], "TEST  tea", "0001111000001")).toEqual({ action: "none", id: saved.id });
  });

  it("makes a new product row for a code not saved", () => {
    expect(rememberPlacement([saved], "test coffee", "0001111000009")).toEqual({ action: "insert" });
  });
});

describe("the count", () => {
  it("goes up by one per add, on the row with that code", () => {
    const a = product({ product_id: "0001111000001", count: 4 });
    const b = product({ product_id: "0001111000002", count: 0 });
    expect(countBumps([a, b], ["0001111000001", "0001111000001", "0009999999999"])).toEqual([{ id: a.id, count: 6 }]);
  });
});

describe("taking a successor", () => {
  const offer = { product_id: "0001111000077", description: "Test Tea 16 ct", size: "16 ct", url: "https://www.kingsoopers.com/p/x/0001111000077", price: 2.99 };

  it("moves the code and Kroger's fields, and keeps names, count and the size first bought", () => {
    const p = product({ product_id: "0001111000001", names: ["tea", "test tea"], count: 7, size_first: "20 ct", missing_since: "2026-10-10T00:00:00Z", successor: offer });
    const result = successorPatch(p, [p]);
    expect(result).toEqual({
      patch: { product_id: "0001111000077", url: offer.url, description: offer.description, size: "16 ct", price: 2.99, in_stock: null, missing_since: null, successor: null, checked_at: null },
    });
    expect("patch" in result && ("names" in result.patch || "count" in result.patch || "size_first" in result.patch)).toBe(false);
  });

  it("is refused with nothing on offer, or when the successor is already saved", () => {
    const p = product({ successor: null });
    expect(successorPatch(p, [p])).toMatchObject({ error: expect.stringMatching(/no successor/) });
    const q = product({ successor: offer });
    const holder = product({ product_id: offer.product_id, names: ["other tea"] });
    expect(successorPatch(q, [q, holder])).toMatchObject({ error: expect.stringMatching(/other tea/) });
  });
});
