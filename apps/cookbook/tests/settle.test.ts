import { describe, expect, it, vi } from "vitest";
import { optionsOf, planLine, readPicks, sendLines, type CartLine } from "@/lib/cart";
import { decider } from "@/lib/decide";
import type { Product } from "@/lib/kroger";
import type { Preference } from "@/lib/preferences";

/**
 * Send to cart's three sections (TEC-51; RULES.md, *Send to cart*): a line
 * matching one saved product goes straight in, several are Settle these, none
 * is No match. Kroger is mocked; neutral fake items only.
 */

const A = "https://www.kingsoopers.com/p/test-cereal-honey/0001111000001";
const B = "https://www.kingsoopers.com/p/test-cereal-plain/0001111000002";

function line(over: Partial<CartLine> & { id: string; name: string }): CartLine {
  return { note: null, quantity: 1, sent_at: null, ...over };
}

function pref(id: string, phrase: string, url: string, tally: number): Preference {
  return {
    id,
    phrase,
    kind: "product",
    url,
    terms: null,
    brand: null,
    note: null,
    tally,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };
}

const MATCH: Product = {
  productId: "0001111000009",
  upc: "0001111000009",
  description: "Test Jam",
  brand: "Test",
  size: "12 oz",
  price: 2.5,
  regular: 2.5,
  promo: null,
  promoEnds: null,
  pickup: true,
  delivery: true,
  inStock: true,
  url: "https://www.kingsoopers.com/p/test-jam/0001111000009",
};

describe("three sections (TEC-51)", () => {
  it("a line matching one saved product is exact, with no search", async () => {
    const search = vi.fn();
    const plan = await planLine(line({ id: "a", name: "test cereal" }), decider([pref("a", "test cereal", A, 2)], []), search);
    expect(plan).toMatchObject({ kind: "exact", upc: "0001111000001" });
    expect(search).not.toHaveBeenCalled();
  });

  it("a line matching several is Settle these: every candidate, most counted first, with what the refresh knows, and no search", async () => {
    const search = vi.fn();
    const decide = decider(
      [pref("low", "test cereal", A, 1), pref("high", "test cereal", B, 9)],
      [{ preference_id: "low", missing_since: null, description: "Test Cereal Honey", size: "12 oz", price: 3.5, url: null }]
    );
    const plan = await planLine(line({ id: "a", name: "2 boxes test cereal" }), decide, search);
    expect(plan.kind).toBe("settle");
    if (plan.kind !== "settle") return;
    expect(plan.options.map((o) => [o.upc, o.tally])).toEqual([
      ["0001111000002", 9],
      ["0001111000001", 1],
    ]);
    expect(plan.options[1]).toMatchObject({ description: "Test Cereal Honey", size: "12 oz", price: 3.5 });
    expect(search).not.toHaveBeenCalled();
  });

  it("the estimate and deal scan price the most counted candidate", () => {
    const decide = decider([pref("low", "test cereal", A, 1), pref("high", "test cereal", B, 9)], []);
    expect(decide("test cereal")?.url).toBe(B);
  });

  it("the same product number twice is one option, and a page without a number is left out", () => {
    const blank = { tally: 0, missing: false, description: null, size: null, price: null, page: null };
    const options = optionsOf({
      phrase: "test cereal",
      kind: "product",
      url: A,
      terms: null,
      candidates: [
        { id: "1", url: A, ...blank },
        { id: "2", url: `${A}?x=1`, ...blank },
        { id: "3", url: "https://www.kingsoopers.com/p/no-number", ...blank },
      ],
    });
    expect(options.map((o) => o.id)).toEqual(["1"]);
  });

  it("a line with no saved product is No match: Kroger's top match, as before", async () => {
    const plan = await planLine(line({ id: "a", name: "test jam" }), decider([pref("a", "test cereal", A, 2)], []), async () => MATCH);
    expect(plan.kind).toBe("match");
  });

  it("a Settle these pick goes in and is remembered the way a match is", async () => {
    const remember = vi.fn(async () => undefined);
    const outcomes = await sendLines(
      { open: [line({ id: "a", name: "test cereal" })], picks: readPicks([{ id: "a", upc: "0001111000002", match: B }]), again: false },
      { add: async () => undefined, remember }
    );
    expect(outcomes[0]).toMatchObject({ result: "added", upc: "0001111000002" });
    expect(remember).toHaveBeenCalledWith("test cereal", B);
  });
});
