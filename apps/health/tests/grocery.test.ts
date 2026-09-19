import { describe, expect, it } from "vitest";
import { asText, searchUrl, validateTidy, type GroceryItem, type TidyLine } from "@/lib/grocery";

function item(over: Partial<GroceryItem> & { id: string; name: string }): GroceryItem {
  return {
    note: null,
    source: "manual",
    checked: false,
    created_at: "2026-09-19T00:00:00Z",
    ...over,
  };
}

describe("search link", () => {
  it("escapes what a grocery line actually contains", () => {
    // "Ben & Jerry's" is the ordinary case, not the adversarial one, and an
    // unescaped & truncates the query at the ampersand.
    expect(searchUrl({ name: "Ben & Jerry's" })).toBe(
      "https://www.kingsoopers.com/q/Ben%20%26%20Jerry's"
    );
  });

  it("collapses the whitespace dictation leaves behind", () => {
    expect(searchUrl({ name: "  whole   milk \n" })).toBe(
      "https://www.kingsoopers.com/q/whole%20milk"
    );
  });

  it("leaves the note out of the search", () => {
    // The note is an instruction to a shopper. "2 lbs" narrows a product
    // search to nothing, which looks like the store not stocking it.
    const withNote = item({ id: "a", name: "ground beef", note: "2 lbs" });
    expect(searchUrl(withNote)).toBe(searchUrl({ name: "ground beef" }));
  });
});

describe("copying the list out", () => {
  it("carries the note, because that is the half a search cannot", () => {
    expect(
      asText([
        item({ id: "a", name: "ground beef", note: "2 lbs" }),
        item({ id: "b", name: "eggs" }),
      ])
    ).toBe("ground beef — 2 lbs\neggs");
  });

  it("leaves out what is already in the trolley", () => {
    expect(
      asText([
        item({ id: "a", name: "eggs", checked: true }),
        item({ id: "b", name: "milk" }),
      ])
    ).toBe("milk");
  });

  it("is empty rather than a header with nothing under it", () => {
    // The screen decides what an empty list says. Text that reads "Grocery
    // list" and then stops is worse pasted into a message than nothing.
    expect(asText([item({ id: "a", name: "eggs", checked: true })])).toBe("");
  });
});

describe("tidy validation", () => {
  const open = [
    item({ id: "a", name: "eggs" }),
    item({ id: "b", name: "a dozen eggs" }),
    item({ id: "c", name: "milk" }),
  ];

  it("accepts a merge that absorbs every line exactly once", () => {
    const lines: TidyLine[] = [
      { name: "eggs", note: "a dozen", absorbed: ["a", "b"] },
      { name: "milk", note: null, absorbed: ["c"] },
    ];
    expect(validateTidy(open, lines)).toBeNull();
  });

  it("refuses a tidy that drops a line", () => {
    // This is the whole reason the check is in code. A tidy that quietly
    // loses the milk gives you a list that looks finished and sends you home
    // without milk.
    const lines: TidyLine[] = [{ name: "eggs", note: "a dozen", absorbed: ["a", "b"] }];
    expect(validateTidy(open, lines)).toContain("milk");
  });

  it("refuses a tidy that uses one line twice", () => {
    const lines: TidyLine[] = [
      { name: "eggs", note: null, absorbed: ["a", "b"] },
      { name: "more eggs", note: null, absorbed: ["b"] },
      { name: "milk", note: null, absorbed: ["c"] },
    ];
    expect(validateTidy(open, lines)).toBe("That used the same line twice.");
  });

  it("refuses a line invented out of nothing", () => {
    // An id that is not on the list means the proposal was built against
    // something other than what is there — a stale read, or a hallucinated
    // id. Either way it is not safe to apply.
    const lines: TidyLine[] = [
      { name: "eggs", note: null, absorbed: ["a", "b"] },
      { name: "milk", note: null, absorbed: ["c"] },
      { name: "bread", note: null, absorbed: ["z"] },
    ];
    expect(validateTidy(open, lines)).toBe(
      "That referred to a line that is not on your list."
    );
  });

  it("refuses a nameless line", () => {
    const lines: TidyLine[] = [
      { name: "  ", note: null, absorbed: ["a", "b", "c"] },
    ];
    expect(validateTidy(open, lines)).toBe("A proposed line has no name.");
  });

  it("accepts an empty proposal for an empty list", () => {
    // Nothing open means nothing to lose, so the guard has nothing to say.
    expect(validateTidy([], [])).toBeNull();
  });
});
