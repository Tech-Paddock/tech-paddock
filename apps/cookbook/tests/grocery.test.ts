import { describe, expect, it } from "vitest";
import { asText, searchUrl, validateTidy, type GroceryItem, type TidyLine } from "@/lib/grocery";

/**
 * The shopping list's pure half, and it is mostly one function.
 *
 * `validateTidy` is the guard that makes it safe to point a cheap model at your
 * list: the model can fail to tidy, but it cannot lose your eggs. That is the
 * reasoning `lib/anthropic.ts` gives for pinning Tidy to Haiku, so these tests are
 * what that reasoning rests on.
 */

function item(over: Partial<GroceryItem> & { id: string; name: string }): GroceryItem {
  return {
    note: null,
    source: "manual",
    checked: false,
    created_at: "2026-09-20T00:00:00Z",
    ...over,
  };
}

const open: GroceryItem[] = [
  item({ id: "a", name: "2 cloves garlic", source: "recipe" }),
  item({ id: "b", name: "1 tbsp minced garlic" }),
  item({ id: "c", name: "Eggs" }),
];

function line(name: string, absorbed: string[], note: string | null = null): TidyLine {
  return { name, note, absorbed };
}

describe("a tidy proposal", () => {
  it("accepts one that accounts for every line exactly once", () => {
    expect(
      validateTidy(open, [line("Garlic", ["a", "b"], "2 cloves and 1 tbsp"), line("Eggs", ["c"])])
    ).toBeNull();
  });

  it("refuses one that drops a line, and says which", () => {
    // The failure this exists for. A list that looks finished and sends you home
    // without eggs is found out at the worst possible moment.
    const problem = validateTidy(open, [line("Garlic", ["a", "b"])]);
    expect(problem).toContain("Eggs");
  });

  it("refuses one that uses the same line twice", () => {
    // One row vanishing into two lines would double what you buy.
    expect(
      validateTidy(open, [line("Garlic", ["a", "b"]), line("More garlic", ["b"]), line("Eggs", ["c"])])
    ).toContain("same line twice");
  });

  it("refuses one referring to a line that is not on the list", () => {
    // A stale proposal — the list moved underneath it — rather than a bad merge.
    expect(
      validateTidy(open, [line("Garlic", ["a", "b"]), line("Eggs", ["c"]), line("Bread", ["z"])])
    ).toContain("not on your list");
  });

  it("refuses a nameless line", () => {
    expect(validateTidy(open, [line("   ", ["a", "b", "c"])])).toContain("no name");
  });
});

describe("what leaves the app", () => {
  it("copies the open lines with their notes, and not the bought ones", () => {
    const list = [
      item({ id: "a", name: "Milk" }),
      item({ id: "b", name: "Eggs", note: "the big box" }),
      item({ id: "c", name: "Bread", checked: true }),
    ];
    expect(asText(list)).toBe("Milk\nEggs — the big box");
  });

  it("copies nothing when there is nothing left to buy", () => {
    expect(asText([item({ id: "a", name: "Milk", checked: true })])).toBe("");
  });

  it("searches the name and deliberately not the note", () => {
    // "the small tin" is an instruction to a shopper, not a search term, and
    // including it narrows a search to nothing.
    expect(searchUrl(item({ id: "a", name: "whole  milk", note: "the small tin" }))).toBe(
      "https://www.kingsoopers.com/q/whole%20milk"
    );
  });
});
