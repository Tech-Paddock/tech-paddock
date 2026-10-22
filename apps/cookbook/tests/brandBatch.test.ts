import { describe, expect, it } from "vitest";
import { exportBatch, previewBatch, readBatch } from "@/lib/brandBatch";
import type { SavedProduct } from "@/lib/brands";
import type { Preference } from "@/lib/preferences";

/**
 * Paste a batch and Export (TEC-131): one format both ways, every row reviewed
 * before anything is written. The format is in NOTES.md. Made-up products only;
 * no fixture here is purchase data.
 */

function saved(over: Partial<SavedProduct> = {}): SavedProduct {
  return {
    id: "p1",
    product_id: "0001111000001",
    names: ["test cereal"],
    count: 3,
    size_first: "12 oz",
    brand: null,
    note: null,
    description: null,
    kroger_brand: null,
    size: null,
    url: "https://www.kingsoopers.com/p/test-cereal/0001111000001",
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

function words(phrase: string, terms: string | null, kind: Preference["kind"] = "terms"): Preference {
  return { id: phrase, phrase, kind, url: null, terms, brand: null, note: null, created_at: "", updated_at: "" };
}

describe("reading a batch", () => {
  it("one row per product: code as text, names as a list, an optional count and size first bought", () => {
    const { entries, refused } = readBatch([
      { product: "0001111000001", names: ["test cereal", "cereal"], count: 6, size_first: "12 oz", note: "test" },
      { phrase: "test rice", terms: "long grain test rice" },
    ]);
    expect(refused).toEqual([]);
    expect(entries).toEqual([
      { row: 1, kind: "product", replace: false, draft: { product_id: "0001111000001", names: ["test cereal", "cereal"], count: 6, size_first: "12 oz", note: "test" } },
      { row: 2, kind: "words", replace: false, draft: { phrase: "test rice", kind: "terms", terms: "long grain test rice" } },
    ]);
  });

  it("names every bad row, and never drops one", () => {
    const { entries, refused } = readBatch([
      { product: 1111000001, names: ["x"] },
      { product: "0001111000001" },
      { product: "0001111000001", names: ["x"], phrase: "x" },
      { phrase: "x", kind: "plain" },
      { phrase: "x", terms: "y", count: 2 },
      { nothing: true },
    ]);
    expect(entries).toEqual([]);
    expect(refused.map((r) => r.row)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(refused[0].reason).toMatch(/leading zeros/);
    expect(refused[1].reason).toMatch(/name/);
  });

  it("refuses a batch that is not a list", () => {
    expect(readBatch({}).refused[0].reason).toMatch(/JSON array/);
  });
});

describe("the review, before anything is written", () => {
  it("new, updates, already, and twice in the batch", () => {
    const entries = previewBatch(
      [
        { product: "0001111000009", names: ["test oats"], count: 1 },
        { product: "0001111000001", names: ["test cereal", "cereal"], count: 6, size_first: "10 oz" },
        { product: "0001111000001", names: ["again"] },
        { product: "0001111000002", names: ["test tea"], count: 0 },
      ],
      [saved(), saved({ id: "p2", product_id: "0001111000002", names: ["test tea"], count: 0, size_first: null })],
      []
    );
    expect(entries.map((e) => e.status)).toEqual(["new", "updates", "refused", "already"]);
    expect(entries[0].send).toEqual({ product: "0001111000009", names: ["test oats"], count: 1 });
    // A saved size first bought is never overwritten by a batch, so it is not a change.
    expect(entries[1].changes).toEqual(['adds "cereal"', "count 3 → 6"]);
    expect(entries[1].send).toMatchObject({ replace: true });
    expect(entries[1].existing).toEqual({ names: ["test cereal"], count: 3, sizeFirst: "12 oz" });
    expect(entries[2].reason).toMatch(/twice in this batch/);
    expect(entries[3].send).toBeUndefined();
  });

  it("search words: new, already, or replacing a phrase's words", () => {
    const entries = previewBatch(
      [
        { phrase: "test rice", terms: "long grain test rice" },
        { phrase: "test bread", terms: "test sourdough" },
        { phrase: "test pasta", terms: "new words" },
      ],
      [],
      [words("test bread", "test sourdough"), words("test pasta", "old words")]
    );
    expect(entries.map((e) => e.status)).toEqual(["new", "already", "replaces"]);
    expect(entries[2]).toMatchObject({ existing: { terms: "old words" }, send: { replace: true } });
  });

  it("a pack conversion is shown as a change, and goes with the row", () => {
    const [e] = previewBatch([{ product: "0001111000001", names: ["test cereal"], pack_label: "Boxes of Cereal", pack_size: 12, pack_unit: "oz" }], [saved()], []);
    expect(e.changes).toEqual(["shopping unit: Boxes of Cereal", "pack: 1 = 12 oz"]);
    expect(e.send).toMatchObject({ pack_label: "Boxes of Cereal", pack_size: 12, pack_unit: "oz" });
  });
});

describe("Export", () => {
  it("is the batch format, and pastes back in as already in Your brands", () => {
    const products = [saved({ pack_label: "Boxes", pack_size: 12, pack_unit: "oz" }), saved({ id: "p2", product_id: "0001111000002", names: ["a test tea"], count: 0, size_first: null })];
    const rows = exportBatch(products, [words("test rice", "long grain test rice"), words("old", null, "plain")]);
    expect(rows).toEqual([
      { product: "0001111000002", names: ["a test tea"], count: 0 },
      { product: "0001111000001", names: ["test cereal"], count: 3, size_first: "12 oz", pack_label: "Boxes", pack_size: 12, pack_unit: "oz" },
      { phrase: "old", kind: "plain" },
      { phrase: "test rice", terms: "long grain test rice" },
    ]);
    const back = previewBatch(rows, products, [words("test rice", "long grain test rice")]);
    expect(back.map((e) => e.status)).toEqual(["already", "already", "refused", "already"]);
  });
});
