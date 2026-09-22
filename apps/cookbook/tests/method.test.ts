import { describe, expect, it } from "vitest";
import { methodSteps } from "@/lib/recipes";

/**
 * **These tests are the fix.** The prompt was tightened in the same change to ask
 * for real line breaks, but a prompt is a request and the recipes already in the
 * book were written before it. `methodSteps` is what actually puts a step on its
 * own line, so what it refuses to split matters as much as what it splits.
 */
describe("methodSteps", () => {
  it("has nothing to say about nothing", () => {
    expect(methodSteps(null)).toEqual([]);
    expect(methodSteps("   ")).toEqual([]);
  });

  it("keeps the author's own line breaks", () => {
    expect(methodSteps("Chop the onion.\nFry it gently.\n\nServe.")).toEqual([
      "Chop the onion.",
      "Fry it gently.",
      "Serve.",
    ]);
  });

  it("splits a run-together numbered method — the case this exists for", () => {
    expect(methodSteps("1. Chop the onion. 2. Fry it gently. 3. Add the beans and simmer.")).toEqual([
      "1. Chop the onion.",
      "2. Fry it gently.",
      "3. Add the beans and simmer.",
    ]);
  });

  it("handles a bracketed marker the same way", () => {
    expect(methodSteps("1) Heat the oil. 2) Brown the mince.")).toEqual([
      "1) Heat the oil.",
      "2) Brown the mince.",
    ]);
  });

  it("never splits an amount that merely looks like a marker", () => {
    // "1.5" is the failure this guard exists for: the character after the dot is
    // a digit, so it is a quantity and not the start of a step.
    expect(methodSteps("Add 1.5 tbsp oil and 2.5 tsp cumin.")).toEqual([
      "Add 1.5 tbsp oil and 2.5 tsp cumin.",
    ]);
  });

  it("never splits a sentence that happens to end in a number", () => {
    // "180. 20 minutes" is a marker by shape and a temperature by meaning. The
    // letter-after-the-space rule is what tells them apart.
    expect(methodSteps("Bake at 180. 20 minutes, until the top catches.")).toEqual([
      "Bake at 180. 20 minutes, until the top catches.",
    ]);
  });

  it("never sentence-splits an unnumbered method", () => {
    // Two sentences, one instruction. Guessing here is how a method becomes
    // ragged, so an unmarked block is left exactly as written.
    expect(methodSteps("Add the stock. Simmer for twenty minutes.")).toEqual([
      "Add the stock. Simmer for twenty minutes.",
    ]);
  });

  it("splits a method that is both numbered and already broken", () => {
    expect(methodSteps("1. Chop the onion.\n2. Fry it. 3. Serve.")).toEqual([
      "1. Chop the onion.",
      "2. Fry it.",
      "3. Serve.",
    ]);
  });
});
