import { describe, expect, it } from "vitest";
import { perServing, wholeRecipe, validateDraft, type RecipeDraft } from "@/lib/recipes";
import { normalizeName } from "@/lib/items";

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
    ...over,
  };
}

describe("a serving", () => {
  it("is the pot divided by how many it feeds", () => {
    expect(perServing({ ...pot, servings: 6 })).toEqual({
      kcal: 400, protein_g: 30, carbs_g: 20, fat_g: 100 / 6,
    });
  });

  it("round-trips back to the pot", () => {
    // The two directions have to agree, because the book stores one and the
    // item the log reads stores the other. A disagreement here is a day's
    // total being quietly wrong.
    expect(wholeRecipe(perServing({ ...pot, servings: 8 }), 8)).toEqual(pot);
  });

  it("does not divide by zero when servings is nonsense", () => {
    // validateDraft refuses this before it can be stored, but perServing also
    // renders a draft the moment it comes back from a model — so it must not
    // produce Infinity on a screen.
    expect(perServing({ ...pot, servings: 0 }).kcal).toBe(2400);
  });
});

describe("what a draft has to be before it becomes a food", () => {
  it("accepts an ordinary one", () => {
    expect(validateDraft(draft())).toBeNull();
  });

  it("refuses a recipe with no calories", () => {
    // Saving this would create an item the log resolves to zero, so every meal
    // referencing it would read as free. That is the one failure this app is
    // least allowed to have.
    expect(validateDraft(draft({ macros: { ...pot, kcal: 0 } }))).toContain("no calories");
  });

  it("refuses fractional or missing servings", () => {
    expect(validateDraft(draft({ servings: 2.5 }))).toContain("whole number");
    expect(validateDraft(draft({ servings: 0 }))).toContain("whole number");
  });

  it("refuses a nameless recipe", () => {
    expect(validateDraft(draft({ name: "   " }))).toContain("needs a name");
  });

  it("refuses a model-produced number that does not name its model", () => {
    // Same pairing the database enforces on item_versions. Catching it here
    // makes it a sentence rather than a constraint violation.
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
  it("normalises the same way a dictated food does", () => {
    // This is why saveRecipe refuses a name that is already a food: both go
    // through one unique index, so "Weeknight Chilli" said out loud would
    // otherwise land on the recipe's item and inherit its macros.
    expect(normalizeName("Weeknight Chilli")).toBe(normalizeName("weeknight  chilli"));
  });
});
