import { describe, expect, it } from "vitest";
import { MAX_TURNED_DOWN, generatePrompt, readTurnedDown } from "@/lib/reroll";

/**
 * "Something else" (TEC-39 D). The bug was the model never seeing what it had
 * offered: "not green beans" came back as the same dish with asparagus.
 */
describe("the generate prompt", () => {
  it("a first ask is the brief alone, as before", () => {
    const prompt = generatePrompt("a side for roast chicken");
    expect(prompt).toContain("What they asked for: a side for roast chicken");
    expect(prompt).not.toContain("turned these down");
  });

  it("a reroll names every draft turned down, with its ingredients", () => {
    const prompt = generatePrompt("a side for roast chicken", [
      { name: "Green bean almondine", ingredients: ["300g green beans", "30g flaked almonds"] },
      { name: "Asparagus almondine", ingredients: ["300g asparagus", "30g flaked almonds"] },
    ]);
    expect(prompt).toContain("1. Green bean almondine — 300g green beans; 30g flaked almonds");
    expect(prompt).toContain("2. Asparagus almondine");
  });

  it("asks for a different base and method, not a swapped vegetable", () => {
    const prompt = generatePrompt("a side", [{ name: "Green bean almondine", ingredients: [] }]);
    expect(prompt).toMatch(/what the dish is built on\s+and how it is cooked/);
    expect(prompt).toContain("not the same dish");
  });

  it("carries the optional reason when there is one", () => {
    expect(generatePrompt("a side", [], "too much butter")).toContain("too much butter");
    expect(generatePrompt("a side", [], "   ")).not.toContain("Why they turned");
  });
});

describe("the turned-down pile, as the route reads it", () => {
  it("is empty when nothing was sent — a first ask", () => {
    expect(readTurnedDown(undefined)).toEqual({ turnedDown: [] });
  });

  it("keeps names and string ingredients and drops the rest", () => {
    expect(readTurnedDown([{ name: " Beans ", ingredients: ["beans", 3, ""], extra: "x" }])).toEqual({
      turnedDown: [{ name: "Beans", ingredients: ["beans"] }],
    });
  });

  it("refuses a nameless draft, a non-list, and a pile past the cap", () => {
    expect("error" in readTurnedDown([{ ingredients: [] }])).toBe(true);
    expect("error" in readTurnedDown("beans")).toBe(true);
    const tooMany = Array.from({ length: MAX_TURNED_DOWN + 1 }, (_, n) => ({ name: `Dish ${n}`, ingredients: [] }));
    expect("error" in readTurnedDown(tooMany)).toBe(true);
  });
});
