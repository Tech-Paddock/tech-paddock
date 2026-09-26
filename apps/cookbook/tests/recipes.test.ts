import { describe, expect, it } from "vitest";
import {
  normalizeName,
  perServing,
  setRating,
  validateDraft,
  wholeRecipe,
  type RecipeDraft,
} from "@/lib/recipes";
import { EMPTY_META } from "@/lib/metadata";
import { InputError } from "@/lib/errors";

/**
 * The pure half of the book: the arithmetic, and what a draft has to be before it
 * is allowed to become a recipe. Nothing here touches Supabase or a model, which
 * is why this is where the rules that matter are asserted rather than described.
 */

const pot = { kcal: 2400, protein_g: 180, carbs_g: 120, fat_g: 100 };

function draft(over: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    name: "Weeknight chilli",
    servings: 6,
    macros: pot,
    origin: "manual",
    source: "estimate",
    model: "claude-haiku-4-5",
    source_url: null,
    ingredients: ["500g beef mince"],
    method: null,
    note: null,
    meta: EMPTY_META,
    ...over,
  };
}

describe("a serving", () => {
  it("is the pot divided by how many it feeds", () => {
    expect(perServing({ ...pot, servings: 6 })).toEqual({
      kcal: 400,
      protein_g: 30,
      carbs_g: 20,
      fat_g: 100 / 6,
    });
  });

  it("round-trips back to the pot", () => {
    // The two directions have to agree. The book stores the pot and every screen
    // shows a serving, so a disagreement here is every number in the app being
    // quietly wrong in the same direction.
    expect(wholeRecipe(perServing({ ...pot, servings: 8 }), 8)).toEqual(pot);
  });

  it("does not divide by zero when servings is nonsense", () => {
    // validateDraft refuses this before it can be stored, but a draft is rendered
    // the moment it comes back from a model — so this must not put Infinity on a
    // screen, which is not even readable as wrong.
    expect(perServing({ ...pot, servings: 0 }).kcal).toBe(2400);
  });
});

describe("what a draft has to be before it goes in the book", () => {
  it("accepts an ordinary one", () => {
    expect(validateDraft(draft())).toBeNull();
  });

  it("refuses a recipe with no calories", () => {
    // A zero-calorie recipe is one nobody estimated. Stored, it reads for ever
    // afterwards like a dish that costs nothing.
    expect(validateDraft(draft({ macros: { ...pot, kcal: 0 } }))).toContain("no calories");
  });

  it("refuses fractional or missing servings", () => {
    // Servings is the divisor for every macro under it.
    expect(validateDraft(draft({ servings: 2.5 }))).toContain("whole number");
    expect(validateDraft(draft({ servings: 0 }))).toContain("whole number");
  });

  it("refuses a nameless recipe", () => {
    expect(validateDraft(draft({ name: "   " }))).toContain("needs a name");
  });

  it("refuses a model-produced number that does not name its model", () => {
    // The same pairing `recipe_model_matches_source` enforces in the database.
    // Catching it here makes it a sentence rather than a constraint violation.
    expect(validateDraft(draft({ source: "estimate", model: null }))).toContain("which model");
  });

  it("lets a hand-entered recipe carry no model", () => {
    expect(validateDraft(draft({ source: "hand", model: null }))).toBeNull();
  });

  it("refuses a negative macro", () => {
    expect(validateDraft(draft({ macros: { ...pot, fat_g: -1 } }))).toContain("fat_g");
  });
});

describe("the name a recipe claims", () => {
  /**
   * **This must stay in step with `recipes_name_key`** in
   * `20260920031200_cookbook_tables.sql`, which indexes
   * `lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))`. The index is what
   * actually refuses a duplicate; this function is how the app can talk about a
   * collision without a round trip, and the two disagreeing would mean a name the
   * app thinks is free and the database rejects.
   */
  it("collapses case, surrounding space and internal runs of space", () => {
    expect(normalizeName("  Weeknight   Chilli ")).toBe("weeknight chilli");
    expect(normalizeName("Weeknight Chilli")).toBe(normalizeName("weeknight  chilli"));
  });

  it("does not treat different dishes as the same name", () => {
    expect(normalizeName("Beef chilli")).not.toBe(normalizeName("Bean chilli"));
  });

  it("collapses tabs and newlines the way the index does", () => {
    // `\s+` in Postgres covers these too, so JavaScript's \s doing the same is
    // the property that keeps the two in step rather than a coincidence.
    expect(normalizeName("Weeknight\tchilli")).toBe("weeknight chilli");
    expect(normalizeName("Weeknight\nchilli")).toBe("weeknight chilli");
  });
});

describe("rating a recipe already in the book", () => {
  it("refuses anything but a whole 1–5 before it reaches the database", async () => {
    // Thrown before the client is built, so no Supabase is needed to prove it —
    // and an InputError is a 400, never the 503 Health reads as an outage.
    for (const bad of [0, 6, 2.5, "great"]) {
      await expect(setRating("r1", bad)).rejects.toBeInstanceOf(InputError);
    }
  });
});
