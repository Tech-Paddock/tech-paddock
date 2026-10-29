import { describe, expect, it, vi } from "vitest";
import { bagOf, lineView, readAs } from "@/lib/lineView";
import { decider, type SavedProduct } from "@/lib/brands";
import { lineTerm, planLine, sendLines, type CartLine } from "@/lib/cart";
import { linkFor } from "@/lib/preferences";
import { targetFor } from "@/lib/pricing";

/**
 * Bulk produce as bags (TEC-190; `RULES.md`, *Storage*): the owner's table of
 * 2026-10-29. Fixed rules, no model; the stored line is never rewritten. Every
 * product and code here is made up.
 */

const line = (name: string, note: string | null = null) => ({ name, note });

describe("the table", () => {
  it("more than 3 onions is a 3 lb bag; 3 stay onions", () => {
    expect(bagOf(line("4 onions"))).toMatchObject({ size: "3 lb bag", phrase: "onions 3 lb bag", was: "4 onions" });
    expect(bagOf(line("3 onions"))).toBeNull();
    expect(bagOf(line("1 onion"))).toBeNull();
  });

  it("more than 3 potatoes is a 5 lb bag", () => {
    expect(bagOf(line("6 russet potatoes"))).toMatchObject({ size: "5 lb bag", phrase: "russet potatoes 5 lb bag" });
    expect(bagOf(line("3 potatoes"))).toBeNull();
  });

  it("more than 4 carrots is a 2 lb bag; 4 stay carrots", () => {
    expect(bagOf(line("5 carrots"))).toMatchObject({ size: "2 lb bag" });
    expect(bagOf(line("4 carrots"))).toBeNull();
  });

  it("more than 4 lemons or limes is a bag", () => {
    expect(bagOf(line("5 lemons"))).toMatchObject({ phrase: "lemons 2 lb bag" });
    expect(bagOf(line("6 limes"))).toMatchObject({ phrase: "limes bag" });
    expect(bagOf(line("4 limes"))).toBeNull();
  });

  it("is only a plain count of the plain item", () => {
    expect(bagOf(line("2 cups chopped onion"))).toBeNull();
    expect(bagOf(line("8 green onions"))).toBeNull();
    expect(bagOf(line("6 sweet potatoes"))).toBeNull();
    expect(bagOf(line("5 baby carrots"))).toBeNull();
    expect(bagOf(line("onions"))).toBeNull();
    expect(bagOf(line("5 onion soup mix"))).toBeNull();
  });

  it("counts a range at its larger end and adds what Tidy wrote in the note", () => {
    expect(bagOf(line("3-4 onions"))).not.toBeNull();
    expect(bagOf(line("onions", "2 and 3"))).toMatchObject({ was: "5 onions" });
  });
});

describe("the list reads it as the bag", () => {
  it("shows the bag, says what it was, and counts one", () => {
    expect(lineView(line("5 onions"), null)).toMatchObject({ name: "Onions, 3 lb bag", amount: "was 5 onions", quantity: 1 });
    expect(lineView(line("5 lemons"), null)).toMatchObject({ name: "Lemons, 2 lb bag", quantity: 1 });
  });

  it("leaves a line under its limit as it was", () => {
    expect(lineView(line("3 onions"), null)).toMatchObject({ name: "Onions", amount: "3", quantity: 3 });
  });

  it("never rewrites the stored line: the view is a new object and the input is untouched", () => {
    const stored = line("5 onions");
    lineView(stored, null);
    expect(stored).toEqual({ name: "5 onions", note: null });
    expect(readAs(stored)).toBe("onions 3 lb bag");
  });

  it("a saved product with its own pack conversion decides the quantity instead", () => {
    const view = lineView(line("5 onions"), { label: "Sacks of Onions", size: 6, unit: null });
    expect(view.name).toBe("Sacks of Onions");
    expect(view.bag).toBeUndefined();
  });

  it("is searched and linked as the bag", () => {
    expect(lineTerm("5 onions")).toBe("onions 3 lb bag");
    expect(lineTerm("3 onions")).toBe("onions");
    expect(decodeURIComponent(linkFor("5 onions", null).href)).toContain("onions 3 lb bag");
    expect(targetFor("5 onions", null)).toEqual({ kind: "term", term: "onions 3 lb bag" });
  });
});

let n = 0;
function saved(names: string[], over: Partial<SavedProduct> = {}): SavedProduct {
  n++;
  const code = String(20000000000 + n).padStart(13, "0");
  return {
    id: `b${n}`,
    product_id: code,
    names,
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

describe("a saved product for the bag beats search", () => {
  const bag = saved(["onions 3 lb bag"]);
  const loose = saved(["onions"]);
  const decide = decider([bag, loose], []);

  it("5 onions goes in as the saved bag, 2 onions as the loose onion", () => {
    const five = decide("5 onions", null);
    expect(five?.kind === "products" && five.candidates.map((c) => c.upc)).toEqual([bag.product_id]);
    const two = decide("2 onions", null);
    expect(two?.kind === "products" && two.candidates.map((c) => c.upc)).toEqual([loose.product_id]);
  });

  it("a saved loose onion never decides the bag: five onions do not go in as one onion", () => {
    expect(decider([loose], [])("5 onions", null)).toBeNull();
    // Nor does a bag named by its Kroger name only: "bag" in the official name is enough to offer it.
    const byName = saved(["yellow onion"], { description: "Test Yellow Onions, 3 lb Bag" });
    const found = decider([loose, byName], [])("5 onions", null);
    expect(found?.kind === "products" && found.via).toBe("description");
    expect(found?.kind === "products" && found.candidates.map((c) => c.upc)).toEqual([byName.product_id]);
  });

  it("with no saved bag, Kroger is searched for the bag, not the single onion", async () => {
    const search = vi.fn(async () => []);
    const plan = await planLine({ id: "a", name: "5 onions", note: null, quantity: 1, sent_at: null }, decider([], []), search);
    expect(search).toHaveBeenCalledWith("onions 3 lb bag");
    expect(plan.kind).toBe("none");
  });

  it("what goes in is remembered under the bag's name, not the count", async () => {
    const remember = vi.fn(async () => undefined);
    const open: CartLine[] = [{ id: "a", name: "5 onions", note: null, quantity: 1, sent_at: null }];
    const upc = "0002220000001";
    await sendLines(
      { open, picks: [{ id: "a", upc, match: `https://www.kingsoopers.com/p/test-onions/${upc}` }], again: false },
      { add: async () => undefined, remember }
    );
    expect(remember).toHaveBeenCalledWith("onions 3 lb bag", expect.any(String), upc, null);
  });
});
