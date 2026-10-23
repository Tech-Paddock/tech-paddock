import { describe, expect, it } from "vitest";
import { brandGroups, defaultNames, fixThese } from "@/lib/brandGroups";
import type { SavedProduct } from "@/lib/brands";

/**
 * Your brands as the tab shows it (TEC-135): groups by shared name with their
 * default and hints, and Fix these. Pure; every product here is made up.
 */

let n = 0;
function product(over: Partial<SavedProduct> = {}): SavedProduct {
  n++;
  const code = over.product_id ?? String(20000000000 + n).padStart(13, "0");
  return {
    id: `g${n}`,
    product_id: code,
    names: ["test item"],
    count: 0,
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
    ...over,
  };
}

describe("Your brands' groups (TEC-135)", () => {
  it("joins products through a shared name, titles the group by it, and puts the default first", () => {
    const zero = product({ names: ["Test Fizz Zero", "test fizz"], description: "Test Fizz Zero Caffeine Free", count: 6 });
    const plain = product({ names: ["test fizz zero", "Test Fizz"], description: "Test Fizz Zero Regular", count: 1, default_for: ["test fizz zero", "test fizz"] });
    const lone = product({ names: ["test garlic"], description: "Test Garlic", count: 15 });
    const groups = brandGroups([zero, lone, plain]);
    expect(groups.map((g) => g.title)).toEqual(["test fizz", "test garlic"]);
    const [fizz, garlic] = groups;
    expect(fizz.shared.sort()).toEqual(["test fizz", "test fizz zero"]);
    expect(fizz.members.map((m) => [m.product.id, m.isDefault])).toEqual([
      [plain.id, true],
      [zero.id, false],
    ]);
    expect(fizz.needsDefault).toBe(false);
    expect(defaultNames(fizz, zero).sort()).toEqual(["test fizz", "test fizz zero"]);
    // A lone product is its own default, and needs no pick.
    expect(garlic).toMatchObject({ needsDefault: false, members: [{ isDefault: true, hint: null }] });
  });

  it("hints what to put on the line for each product that is not the default", () => {
    const a = product({ names: ["test muffins"], description: "Test Bakery Original Test Muffins", count: 8 });
    const b = product({ names: ["test muffins"], description: "Test Bakery Cinnamon Raisin Test Muffins", count: 4 });
    const [g] = brandGroups([a, b]);
    expect(g.needsDefault).toBe(true);
    expect(g.members.map((m) => m.hint)).toEqual(["original", "cinnamon raisin"]);
  });
});

describe("Fix these (TEC-135)", () => {
  it("lists a shrunk size, a product Kroger no longer returns, and a check: note", () => {
    const shrank = product({ names: ["test chips"], description: "Test Chips", size_first: "12 oz", size: "10 oz", price: 3.99 });
    const gone = product({
      names: ["test egg"],
      description: "Test Egg Candy",
      missing_since: "2026-10-20T00:00:00Z",
      successor: { product_id: "0002000009999", description: "Test Cup Candy", size: null, url: "https://www.kingsoopers.com/p/x/0002000009999", price: null },
    });
    const check = product({ names: ["test tomatoes"], note: "check: seeded as Test Potatoes" });
    const fine = product({ names: ["test fine"], note: "the big one" });
    const items = fixThese([fine, check, gone, shrank]);
    expect(items.map((i) => [i.kind, i.title])).toEqual([
      ["shrank", "Test Chips · shrank"],
      ["gone", "Test Egg Candy · gone"],
      ["check", "test tomatoes · check it"],
    ]);
    expect(items[1].detail).toContain("closest: Test Cup Candy");
    expect(items[2].detail).toBe("seeded as Test Potatoes · paste the right page");
  });
});
