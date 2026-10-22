import { describe, expect, it } from "vitest";
import { exportBatch, previewBatch, readBatch } from "@/lib/brandBatch";
import { matchCandidates, placeDraft, readDraft, tallyBumps, type Preference } from "@/lib/preferences";
import { productIdFromUrl } from "@/lib/kingsoopers";

/**
 * Paste a batch, its review, and Export (TEC-51). Neutral fake items only: no
 * purchase history, receipt or personal data belongs in a test.
 */

const A = "https://www.kingsoopers.com/p/test-cereal-honey/0001111000001";
const B = "https://www.kingsoopers.com/p/test-cereal-plain/0001111000002";
const C = "https://www.kingsoopers.com/p/test-cereal-family/0001111000003";

function row(over: Partial<Preference> & { id: string; phrase: string }): Preference {
  return {
    kind: "product",
    url: A,
    terms: null,
    brand: null,
    note: null,
    tally: 0,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

describe("the batch format", () => {
  it("reads a seed row: phrase, a product number, a count — the number becomes a page that reads back as it", () => {
    const { entries, refused } = readBatch([{ phrase: "test cereal", product: "0001111000001", count: 7 }]);
    expect(refused).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0].draft).toMatchObject({ phrase: "test cereal", kind: "product", tally: 7 });
    expect(productIdFromUrl(entries[0].draft.url as string)).toBe("0001111000001");
  });

  it("takes a product page as the product, and the older url name too", () => {
    const { entries } = readBatch([
      { phrase: "test cereal", product: A },
      { phrase: "test oats", url: B, kind: "product" },
    ]);
    expect(entries.map((e) => e.draft.url)).toEqual([A, B]);
  });

  it("each alternative becomes its own row under the same phrase, with its own count", () => {
    const { entries } = readBatch([
      { phrase: "test cereal", product: A, count: 5, alternatives: [{ product: B, count: 2 }, { product: "0001111000003" }] },
    ]);
    expect(entries.map((e) => [e.row, e.draft.phrase, productIdFromUrl(e.draft.url as string), e.draft.tally])).toEqual([
      [1, "test cereal", "0001111000001", 5],
      [1, "test cereal", "0001111000002", 2],
      [1, "test cereal", "0001111000003", undefined],
    ]);
  });

  it("search words are still a row", () => {
    const { entries } = readBatch([{ phrase: "test rice", terms: "long grain test rice" }]);
    expect(entries[0].draft).toMatchObject({ kind: "terms", terms: "long grain test rice" });
  });

  it("names every row it cannot read, and keeps the rest", () => {
    const { entries, refused } = readBatch([
      { phrase: "test milk", kind: "plain" },
      { phrase: "test eggs", product: "https://www.kingsoopers.com/q/eggs" },
      { phrase: "test jam", product: A, count: -1 },
      { phrase: "test tea", product: A, terms: "tea" },
      { phrase: "test rice", terms: "rice", count: 3 },
      { phrase: "" },
      { phrase: "test bread", product: A, alternatives: [{ product: "nope" }, { product: B }] },
    ]);
    expect(refused.map((r) => r.row)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(refused[0].reason).toContain("plain");
    // The good alternative of row 7 still landed, beside its main product.
    expect(entries.map((e) => [e.row, productIdFromUrl(e.draft.url as string)])).toEqual([
      [7, "0001111000001"],
      [7, "0001111000002"],
    ]);
  });

  it("refuses a batch that is not an array", () => {
    expect(readBatch({ phrase: "x" }).refused[0].reason).toContain("array");
  });
});

describe("the review writes nothing and marks what is already there", () => {
  it("new, another choice, already in Your brands, replaces, and twice in this batch", () => {
    const saved = [
      row({ id: "cereal-a", phrase: "test cereal", url: A, tally: 4 }),
      row({ id: "rice", phrase: "test rice", kind: "terms", url: null, terms: "white test rice" }),
    ];
    const entries = previewBatch(
      [
        { phrase: "test oats", product: C, count: 1 },
        { phrase: "test cereal", product: A, count: 9 },
        { phrase: "Test  Cereal", product: B, count: 2 },
        { phrase: "test rice", product: C },
        { phrase: "test oats", product: C },
        { phrase: "test milk", kind: "plain" },
      ],
      saved
    );
    expect(entries.map((e) => [e.row, e.status])).toEqual([
      [1, "new"],
      [2, "already"],
      [3, "adds"],
      [4, "replaces"],
      [5, "refused"],
      [6, "refused"],
    ]);
    expect(entries[1].existing).toMatchObject({ count: 4 });
    // Writing one over a saved row needs the tick: only then does it carry replace.
    expect(entries[1].send).toMatchObject({ replace: true, count: 9 });
    expect(entries[0].send).not.toHaveProperty("replace");
    expect(entries[2].beside).toBe(1);
  });

  it("refuses search words for a phrase that holds several products", () => {
    const saved = [row({ id: "a", phrase: "test cereal", url: A }), row({ id: "b", phrase: "test cereal", url: B })];
    const [entry] = previewBatch([{ phrase: "test cereal", terms: "cereal" }], saved);
    expect(entry.status).toBe("refused");
  });
});

describe("export pastes back in", () => {
  const saved = [
    row({ id: "b", phrase: "test cereal", url: B, tally: 2, note: "the small box" }),
    row({ id: "a", phrase: "test cereal", url: A, tally: 6, brand: "Test Brand" }),
    row({ id: "r", phrase: "test rice", kind: "terms", url: null, terms: "white test rice" }),
    row({ id: "p", phrase: "test water", kind: "plain", url: null }),
  ];

  it("groups by phrase, most counted first, the rest as alternatives", () => {
    expect(exportBatch(saved)).toEqual([
      {
        phrase: "test cereal",
        product: A,
        count: 6,
        brand: "Test Brand",
        alternatives: [{ product: B, count: 2, note: "the small box" }],
      },
      { phrase: "test rice", terms: "white test rice" },
      { phrase: "test water", kind: "plain" },
    ]);
  });

  it("an export reviews as already in Your brands — nothing new, nothing overwritten unticked — and a plain row is refused by name", () => {
    const entries = previewBatch(exportBatch(saved), saved);
    expect(entries.map((e) => e.status)).toEqual(["already", "already", "already", "refused"]);
    expect(entries[3].reason).toContain("test water");
  });

  it("into an empty table, it writes back the same rows and counts", () => {
    const { entries } = readBatch(exportBatch(saved));
    expect(entries.map((e) => [e.draft.phrase, e.draft.kind, e.draft.url ?? e.draft.terms, e.draft.tally])).toEqual([
      ["test cereal", "product", A, 6],
      ["test cereal", "product", B, 2],
      ["test rice", "terms", "white test rice", undefined],
    ]);
  });
});

describe("where a write lands (placeDraft)", () => {
  const saved = [row({ id: "a", phrase: "test cereal", url: A }), row({ id: "w", phrase: "test rice", kind: "terms", url: null, terms: "rice" })];

  it("the same product under the same phrase is that row; another product is a new row beside it", () => {
    expect(placeDraft({ phrase: "test cereal", kind: "product", url: A }, saved)).toMatchObject({ action: "update", same: true });
    expect(placeDraft({ phrase: "test cereal", kind: "product", url: B }, saved)).toMatchObject({ action: "insert", beside: 1 });
  });

  it("a product replaces the phrase's search words, as before", () => {
    expect(placeDraft({ phrase: "test rice", kind: "product", url: C }, saved)).toMatchObject({ action: "update", existing: { id: "w" } });
  });

  it("the editor updates the row it opened, and refuses a duplicate", () => {
    const two = [...saved, row({ id: "b", phrase: "test cereal", url: B })];
    expect(placeDraft({ phrase: "test cereal", kind: "product", url: C }, two, "b")).toMatchObject({ action: "update", existing: { id: "b" } });
    expect(placeDraft({ phrase: "test cereal", kind: "product", url: A }, two, "b")).toHaveProperty("error");
  });

  it("a count is a whole number, 0 or more, and only when sent", () => {
    expect("row" in readDraft({ phrase: "x", kind: "product", url: A }) && "tally" in (readDraft({ phrase: "x", kind: "product", url: A }) as { row: object }).row).toBe(false);
    expect(readDraft({ phrase: "x", kind: "product", url: A, tally: 1.5 })).toHaveProperty("error");
  });
});

describe("the count", () => {
  it("+1 per add on every product row carrying that number", () => {
    const saved = [
      row({ id: "a", phrase: "test cereal", url: A, tally: 3 }),
      row({ id: "a2", phrase: "honey test cereal", url: A, tally: 0 }),
      row({ id: "b", phrase: "test cereal", url: B, tally: 1 }),
    ];
    expect(tallyBumps(saved, ["0001111000001", "0001111000001"])).toEqual([
      { id: "a", tally: 5 },
      { id: "a2", tally: 2 },
    ]);
  });

  it("ranks a phrase's products, most counted first; the longest phrase still decides", () => {
    const saved = [
      row({ id: "low", phrase: "test cereal", url: A, tally: 1, updated_at: "2026-10-09T00:00:00Z" }),
      row({ id: "high", phrase: "test cereal", url: B, tally: 8 }),
      row({ id: "honey", phrase: "honey test cereal", url: C }),
    ];
    expect(matchCandidates("test cereal", saved).map((p) => p.id)).toEqual(["high", "low"]);
    expect(matchCandidates("2 boxes honey test cereal", saved).map((p) => p.id)).toEqual(["honey"]);
  });
});
