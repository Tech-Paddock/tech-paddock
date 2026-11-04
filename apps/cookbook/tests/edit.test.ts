import { describe, expect, it, vi } from "vitest";
import { applyEdit, changesThePot, clearsMacros, readEdit, type EditDeps, type EditTarget, type RecipeEdit } from "@/lib/edit";
import { EMPTY_META } from "@/lib/metadata";
import { normalizeName, perServing, toServingRows, type Recipe } from "@/lib/recipes";
import type { Macros } from "@/lib/macros";
import { ConflictError, InputError } from "@/lib/errors";

/**
 * Editing a kept recipe (2026-09-26; TEC-223). What has to hold: an edit calls no
 * model; one that changes the ingredients or the servings clears the macros, and
 * every other edit leaves them alone.
 */

const stored: EditTarget = {
  id: "r1",
  name: "Weeknight chilli",
  servings: 6,
  ingredients: ["500g beef mince", "1 tin kidney beans"],
};

function edit(over: Partial<RecipeEdit> = {}): RecipeEdit {
  return {
    name: stored.name,
    servings: 6,
    ingredients: stored.ingredients,
    method: "1. Brown the mince.\n2. Add the beans.",
    meta: EMPTY_META,
    ...over,
  };
}

function deps(over: Partial<EditDeps<string>> = {}) {
  const d = {
    getRecipe: vi.fn(async () => stored),
    nameTakenByOther: vi.fn(async () => false),
    update: vi.fn(async () => "written"),
    normalizeName,
    ...over,
  };
  return d;
}

describe("what clears the macros", () => {
  it("a changed ingredient does, in the one write", async () => {
    const d = deps();
    const next = edit({ ingredients: ["750g beef mince", "1 tin kidney beans"] });
    const result = await applyEdit(d, "r1", next);
    expect(d.update).toHaveBeenCalledTimes(1);
    expect(d.update).toHaveBeenCalledWith("r1", next, true);
    expect(result.macrosCleared).toBe(true);
  });

  it("a changed serving count does too", async () => {
    const d = deps();
    const result = await applyEdit(d, "r1", edit({ servings: 8 }));
    expect(d.update).toHaveBeenCalledWith("r1", edit({ servings: 8 }), true);
    expect(result.macrosCleared).toBe(true);
  });

  it("name, method and metadata do not", async () => {
    const d = deps();
    const next = edit({ name: "Friday chilli", method: "Just cook it.", meta: { ...EMPTY_META, meal: "main", rating: 5 } });
    const result = await applyEdit(d, "r1", next);
    expect(d.update).toHaveBeenCalledWith("r1", next, false);
    expect(result.macrosCleared).toBe(false);
  });

  it("compares lines as written after trimming, and counts a reorder as a change", () => {
    expect(changesThePot(stored, { ingredients: [" 500g beef mince ", "1 tin kidney beans", ""] })).toBe(false);
    expect(changesThePot(stored, { ingredients: ["1 tin kidney beans", "500g beef mince"] })).toBe(true);
    expect(changesThePot(stored, { ingredients: ["500g beef mince"] })).toBe(true);
  });

  it("clearsMacros is the ingredients or the servings, nothing else", () => {
    expect(clearsMacros(stored, { ingredients: stored.ingredients, servings: 6 })).toBe(false);
    expect(clearsMacros(stored, { ingredients: stored.ingredients, servings: 7 })).toBe(true);
    expect(clearsMacros(stored, { ingredients: ["x"], servings: 6 })).toBe(true);
  });
});

describe("refusals before any call", () => {
  it("a name another recipe holds is a 409, and writes nothing", async () => {
    const d = deps({ nameTakenByOther: vi.fn(async () => true) });
    const run = applyEdit(d, "r1", edit({ name: "Beef stew", ingredients: ["other"] }));
    await expect(run).rejects.toBeInstanceOf(ConflictError);
    expect(d.update).not.toHaveBeenCalled();
  });

  it("re-casing its own name is not a collision with itself", async () => {
    const d = deps({ nameTakenByOther: vi.fn(async () => true) });
    await applyEdit(d, "r1", edit({ name: "weeknight  CHILLI" }));
    expect(d.nameTakenByOther).not.toHaveBeenCalled();
    expect(d.update).toHaveBeenCalled();
  });

  it("a recipe no longer in the book is a 400, not an outage", async () => {
    const d = deps({ getRecipe: vi.fn(async () => null) });
    await expect(applyEdit(d, "gone", edit())).rejects.toBeInstanceOf(InputError);
    expect(d.update).not.toHaveBeenCalled();
  });
});

describe("reading an edit off a request", () => {
  it("accepts the textarea's text and drops blank lines", () => {
    const read = readEdit({ name: " Chilli ", servings: "4", ingredients: "a\n\n b ", method: "", meta: {} });
    expect(read).toEqual({
      edit: { name: "Chilli", servings: 4, ingredients: ["a", "b"], method: null, meta: EMPTY_META },
    });
  });

  it("refuses what a recipe cannot be", () => {
    expect(readEdit({ name: "", servings: 4, ingredients: ["a"] })).toHaveProperty("error");
    expect(readEdit({ name: "x", servings: 2.5, ingredients: ["a"] })).toHaveProperty("error");
    expect(readEdit({ name: "x", servings: 0, ingredients: ["a"] })).toHaveProperty("error");
    expect(readEdit({ name: "x", servings: 4, ingredients: [] })).toHaveProperty("error");
  });

  it("reads metadata through the same reader as every way in — no free-of claim, no macro tag", () => {
    const read = readEdit({
      name: "x",
      servings: 2,
      ingredients: ["a"],
      meta: { tags: ["gluten-free", "high protein", "one-pot"], rating: 4, meal: "main" },
    });
    expect("edit" in read && read.edit.meta.tags).toEqual(["one-pot"]);
    expect("edit" in read && read.edit.meta.rating).toBe(4);
  });
});

describe("what Health reads after an edit", () => {
  it("/api/servings divides the edited pot by the edited servings, in the same shape", () => {
    // A row that has macros: the contract's per-serving figure is the pot over the count.
    const row = {
      id: "r1",
      name: "Weeknight chilli",
      servings: 8,
      kcal: 2400,
      protein_g: 180,
      carbs_g: 120,
      fat_g: 100,
    } as Recipe;
    const [served] = toServingRows([row]);
    expect(Object.keys(served).sort()).toEqual(["id", "name", "per_serving", "servings"]);
    expect(served.per_serving).toEqual(perServing(row as Recipe & Macros));
    expect(served.per_serving.kcal).toBe(300);
  });

  it("leaves out a recipe whose macros an edit cleared, until the nightly job redoes them", () => {
    const cleared = { id: "r1", name: "Weeknight chilli", servings: 8, kcal: null, protein_g: null, carbs_g: null, fat_g: null } as Recipe;
    expect(toServingRows([cleared])).toEqual([]);
  });
});
