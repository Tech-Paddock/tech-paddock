import { describe, expect, it } from "vitest";
import { compareNames, readSort, sortKey, sortRecipes } from "@/lib/recipeSort";

const names = (list: { name: string }[]) => list.map((r) => r.name);
const book = (...n: string[]) => n.map((name, i) => ({ name, i }));

describe("sortKey", () => {
  it("drops a leading The, in any case", () => {
    expect(sortKey("The Best Chili")).toBe("Best Chili");
    expect(sortKey("the best chili")).toBe("best chili");
    expect(sortKey("  THE   Soup")).toBe("Soup");
  });
  it("keeps a The that is not a leading word, and a bare The", () => {
    expect(sortKey("Theo's Eggs")).toBe("Theo's Eggs");
    expect(sortKey("Soup of the Day")).toBe("Soup of the Day");
    expect(sortKey("The")).toBe("The");
  });
});

describe("sortRecipes", () => {
  it("leaves the book order alone by default, and does not mutate", () => {
    const input = book("Pasta", "Apple pie", "Chili");
    expect(names(sortRecipes(input, "default"))).toEqual(["Pasta", "Apple pie", "Chili"]);
    sortRecipes(input, "az");
    expect(names(input)).toEqual(["Pasta", "Apple pie", "Chili"]);
  });
  it("sorts A to Z ignoring case", () => {
    expect(names(sortRecipes(book("banana bread", "Apple pie", "chili"), "az"))).toEqual([
      "Apple pie",
      "banana bread",
      "chili",
    ]);
  });
  it("files The Best Bread under B", () => {
    expect(names(sortRecipes(book("Chili", "The Best Bread", "Apple pie", "the avocado toast"), "az"))).toEqual([
      "Apple pie",
      "the avocado toast",
      "The Best Bread",
      "Chili",
    ]);
  });
  it("treats accents as the same letter", () => {
    expect(names(sortRecipes(book("Zucchini", "Éclair", "Eggs", "Crème brûlée"), "az"))).toEqual([
      "Crème brûlée",
      "Éclair",
      "Eggs",
      "Zucchini",
    ]);
  });
  it("keeps the incoming order for a tie", () => {
    const out = sortRecipes(book("the Chili", "Chili", "CHILI", "Apple"), "az");
    expect(names(out)).toEqual(["Apple", "the Chili", "Chili", "CHILI"]);
    expect(compareNames("Cafe", "Café")).toBe(0);
  });
});

describe("readSort", () => {
  it("accepts az and falls back to the default", () => {
    expect(readSort("az")).toBe("az");
    expect(readSort("default")).toBe("default");
    expect(readSort("zz")).toBe("default");
    expect(readSort(null)).toBe("default");
  });
});
