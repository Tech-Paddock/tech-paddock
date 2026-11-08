import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compareNames, sortKey, sortRecipes } from "@/lib/recipeSort";

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

describe("sortRecipes (always A to Z, TEC-235)", () => {
  it("sorts A to Z ignoring case, and does not mutate", () => {
    const input = book("banana bread", "Apple pie", "chili");
    expect(names(sortRecipes(input))).toEqual(["Apple pie", "banana bread", "chili"]);
    expect(names(input)).toEqual(["banana bread", "Apple pie", "chili"]);
  });
  it("files The Best Bread under B", () => {
    expect(names(sortRecipes(book("Chili", "The Best Bread", "Apple pie", "the avocado toast")))).toEqual([
      "Apple pie",
      "the avocado toast",
      "The Best Bread",
      "Chili",
    ]);
  });
  it("treats accents as the same letter", () => {
    expect(names(sortRecipes(book("Zucchini", "Éclair", "Eggs", "Crème brûlée")))).toEqual([
      "Crème brûlée",
      "Éclair",
      "Eggs",
      "Zucchini",
    ]);
  });
  it("keeps the incoming order for a tie", () => {
    const out = sortRecipes(book("the Chili", "Chili", "CHILI", "Apple"));
    expect(names(out)).toEqual(["Apple", "the Chili", "Chili", "CHILI"]);
    expect(compareNames("Cafe", "Café")).toBe(0);
  });
});

describe("the book offers no sort choice", () => {
  const source = readFileSync("app/Book.tsx", "utf8");
  it("has no Sort select and keeps nothing in storage for one", () => {
    expect(source).not.toContain("Sort the book");
    expect(source).not.toContain("<select");
    expect(source).not.toContain("book-sort");
  });
});
