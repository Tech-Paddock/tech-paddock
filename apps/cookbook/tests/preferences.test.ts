import { describe, expect, it } from "vitest";
import { searchFor, searchUrl } from "../lib/grocery";
import { isKingSoopersProduct } from "../lib/kingsoopers";
import { decide, type SavedProduct, type WordRow } from "../lib/brands";
import { linkFor, normalizePhrase, readDraft } from "../lib/preferences";

/**
 * Search words in Your brands, and the link a list line carries (TEC-131:
 * products moved to their own rows; `brand_preferences` keeps the phrases).
 */

function words(phrase: string, over: Partial<WordRow> = {}): WordRow {
  return { id: phrase, phrase, kind: "terms", terms: `${phrase} the good one`, updated_at: "2026-09-20T00:00:00Z", ...over };
}

function product(over: Partial<SavedProduct> = {}): SavedProduct {
  return {
    id: "p1",
    product_id: "0085631200203",
    names: ["milk"],
    count: 0,
    size_first: null,
    brand: null,
    note: null,
    description: null,
    kroger_brand: null,
    size: null,
    url: "https://www.kingsoopers.com/p/fairlife-2-milk/0085631200203",
    price: null,
    in_stock: null,
    checked_at: null,
    missing_since: null,
    successor: null,
    pack_label: null,
    pack_size: null,
    pack_unit: null,
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    ...over,
  };
}

const link = (name: string, products: SavedProduct[], rows: WordRow[]) => linkFor(name, decide(name, products, rows));

describe("normalizePhrase", () => {
  // The database refuses a duplicate phrase using exactly this expression.
  it("matches the index expression: trim, collapse, lowercase", () => {
    expect(normalizePhrase("  Whole   MILK ")).toBe("whole milk");
  });
});

describe("a line's link", () => {
  it("a saved product's page wins outright", () => {
    expect(link("milk", [product()], []).href).toBe("https://www.kingsoopers.com/p/fairlife-2-milk/0085631200203");
  });

  it("several products: the most counted one's page", () => {
    const a = product({ id: "a", product_id: "0000000000011", url: "https://www.kingsoopers.com/p/a/0000000000011", count: 1 });
    const b = product({ id: "b", product_id: "0000000000022", url: "https://www.kingsoopers.com/p/b/0000000000022", count: 5 });
    expect(link("milk", [a, b], []).href).toBe("https://www.kingsoopers.com/p/b/0000000000022");
  });

  it("search words search the words, not the line", () => {
    expect(link("1 cup milk", [], [words("milk", { terms: "fairlife 2%" })]).href).toBe(searchFor("fairlife 2%"));
  });

  it("a plain phrase resolves like no phrase — but says it decided", () => {
    const resolved = link("whole milk", [], [words("whole milk", { kind: "plain", terms: null })]);
    expect(resolved.href).toBe(searchFor("whole milk"));
    expect(resolved.via?.kind).toBe("plain");
  });

  it("nothing matched: a search for the item alone (TEC-131), with nothing deciding", () => {
    const resolved = link("6 cloves of garlic", [product()], []);
    expect(resolved.href).toBe(searchFor("garlic cloves"));
    expect(resolved.via).toBeNull();
  });

  it("a line with nothing to clean is the same link the plain list builds", () => {
    expect(link("saffron", [], []).href).toBe(searchUrl({ name: "saffron" }));
  });
});

describe("isKingSoopersProduct — what Paste accepts", () => {
  it("accepts a product page", () => {
    expect(isKingSoopersProduct("https://www.kingsoopers.com/p/fairlife-2-milk/0020262400000")).toBe(true);
    expect(isKingSoopersProduct("  https://kingsoopers.com/p/eggs/0001111060903  ")).toBe(true);
  });

  it("refuses a search, another shop, plain http and plain words", () => {
    expect(isKingSoopersProduct("https://www.kingsoopers.com/q/milk")).toBe(false);
    expect(isKingSoopersProduct("https://www.kroger.com/p/fairlife/0020262400000")).toBe(false);
    expect(isKingSoopersProduct("http://www.kingsoopers.com/p/fairlife/0020262400000")).toBe(false);
    expect(isKingSoopersProduct("fairlife 2%")).toBe(false);
    expect(isKingSoopersProduct("https://www.kingsoopers.com.evil.example/p/x")).toBe(false);
  });
});

describe("readDraft — search words only (TEC-131)", () => {
  it("refuses a product here: products are their own rows now", () => {
    const read = readDraft({ phrase: "milk", kind: "product", url: "https://www.kingsoopers.com/p/x/0085631200203" });
    expect("error" in read && read.error).toMatch(/milk.*product/);
  });

  it("needs the words to search, naming the phrase so a batch says which row", () => {
    const read = readDraft({ phrase: "milk", kind: "terms" });
    expect("error" in read && read.error).toContain("milk");
  });

  it("takes kind as optional, and never carries a url", () => {
    const read = readDraft({ phrase: "milk", terms: "fairlife 2%", url: "https://example.com" });
    expect("row" in read && read.row).toEqual({ phrase: "milk", kind: "terms", terms: "fairlife 2%" });
  });

  it("refuses plain, from the editor and from a batch alike (TEC-39)", () => {
    const read = readDraft({ phrase: "whole milk", kind: "plain" });
    expect("error" in read && read.error).toContain("whole milk");
  });

  it("keeps a brand a batch sends", () => {
    const read = readDraft({ phrase: "milk", kind: "terms", terms: "fairlife 2%", brand: "Fairlife" });
    expect("row" in read && read.row.brand).toBe("Fairlife");
  });

  it("leaves note and brand out of the write when they were not sent — editing keeps the note (TEC-29)", () => {
    const read = readDraft({ phrase: "milk", kind: "terms", terms: "fairlife 2%" });
    expect("row" in read && "note" in read.row).toBe(false);
    expect("row" in read && "brand" in read.row).toBe(false);
  });

  it("clears a note only when a blank one is sent on purpose", () => {
    const read = readDraft({ phrase: "milk", kind: "terms", terms: "fairlife 2%", note: "  " });
    expect("row" in read && read.row.note).toBeNull();
  });
});
