import { describe, expect, it, vi } from "vitest";
import { applyEdit, changesThePot, readEdit, type EditDeps, type EditTarget, type RecipeEdit } from "@/lib/edit";
import { EMPTY_META } from "@/lib/metadata";
import { normalizeName, perServing, toServingRows, type Recipe } from "@/lib/recipes";
import { ConflictError, InputError, statusOf } from "@/lib/errors";

/**
 * Editing a kept recipe (Joel, 2026-09-26). What has to hold: an edit that
 * changes the ingredients re-prices with one call, one that does not calls
 * nothing, and **a failed re-price writes nothing and never looks like success.**
 */

const stored: EditTarget = {
  id: "r1",
  name: "Weeknight chilli",
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

const newPot = { kcal: 3000, protein_g: 200, carbs_g: 150, fat_g: 120 };

function deps(over: Partial<EditDeps<string>> = {}) {
  const d = {
    getRecipe: vi.fn(async () => stored),
    nameTakenByOther: vi.fn(async () => false),
    estimate: vi.fn(async () => ({ macros: newPot, note: "assumed 1 tbsp oil" })),
    update: vi.fn(async () => "written"),
    normalizeName,
    ...over,
  };
  return d;
}

describe("what re-prices", () => {
  it("a changed ingredient does, with one call, and the new pot is what is written", async () => {
    const d = deps();
    const next = edit({ ingredients: ["750g beef mince", "1 tin kidney beans"] });
    const result = await applyEdit(d, "r1", next, "claude-haiku-4-5");
    expect(d.estimate).toHaveBeenCalledTimes(1);
    expect(d.update).toHaveBeenCalledWith("r1", next, {
      macros: newPot,
      model: "claude-haiku-4-5",
      note: "assumed 1 tbsp oil",
    });
    expect(result.repriced).toBe(true);
  });

  it("servings alone does not: same pot, a new divisor", async () => {
    const d = deps();
    const result = await applyEdit(d, "r1", edit({ servings: 8 }), "claude-haiku-4-5");
    expect(d.estimate).not.toHaveBeenCalled();
    expect(d.update).toHaveBeenCalledWith("r1", edit({ servings: 8 }), null);
    expect(result.repriced).toBe(false);
  });

  it("name, method and metadata do not", async () => {
    const d = deps();
    await applyEdit(
      d,
      "r1",
      edit({ name: "Friday chilli", method: "Just cook it.", meta: { ...EMPTY_META, meal: "dinner", rating: 5 } }),
      "claude-haiku-4-5"
    );
    expect(d.estimate).not.toHaveBeenCalled();
  });

  it("compares lines as written after trimming, and counts a reorder as a change", () => {
    expect(changesThePot(stored, { ingredients: [" 500g beef mince ", "1 tin kidney beans", ""] })).toBe(false);
    expect(changesThePot(stored, { ingredients: ["1 tin kidney beans", "500g beef mince"] })).toBe(true);
    expect(changesThePot(stored, { ingredients: ["500g beef mince"] })).toBe(true);
  });
});

describe("a failed re-price", () => {
  it("writes nothing and throws — it never returns as if it saved", async () => {
    const d = deps({
      estimate: vi.fn(async () => {
        throw new Error("Haiku 4.5 ran out of room before it finished. Nothing was kept — try again.");
      }),
    });
    await expect(
      applyEdit(d, "r1", edit({ ingredients: ["750g beef mince"], name: "Renamed" }), "claude-haiku-4-5")
    ).rejects.toThrow(/ran out of room/);
    // The name change rode with it and was not written on its own either.
    expect(d.update).not.toHaveBeenCalled();
  });

  it("is a 500, never a status the screen could read as fine", () => {
    expect(statusOf(new Error("did not return usable macros"))).toBe(500);
  });
});

describe("refusals before any call", () => {
  it("a name another recipe holds is a 409, and pays for no pricing", async () => {
    const d = deps({ nameTakenByOther: vi.fn(async () => true) });
    const run = applyEdit(d, "r1", edit({ name: "Beef stew", ingredients: ["other"] }), "claude-haiku-4-5");
    await expect(run).rejects.toBeInstanceOf(ConflictError);
    expect(d.estimate).not.toHaveBeenCalled();
    expect(d.update).not.toHaveBeenCalled();
  });

  it("re-casing its own name is not a collision with itself", async () => {
    const d = deps({ nameTakenByOther: vi.fn(async () => true) });
    await applyEdit(d, "r1", edit({ name: "weeknight  CHILLI" }), "claude-haiku-4-5");
    expect(d.nameTakenByOther).not.toHaveBeenCalled();
    expect(d.update).toHaveBeenCalled();
  });

  it("a recipe no longer in the book is a 400, not an outage", async () => {
    const d = deps({ getRecipe: vi.fn(async () => null) });
    await expect(applyEdit(d, "gone", edit(), "claude-haiku-4-5")).rejects.toBeInstanceOf(InputError);
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
      meta: { tags: ["gluten-free", "high protein", "one-pot"], rating: 4, meal: "dinner" },
    });
    expect("edit" in read && read.edit.meta.tags).toEqual(["one-pot"]);
    expect("edit" in read && read.edit.meta.rating).toBe(4);
  });
});

describe("what Health reads after an edit", () => {
  it("/api/servings divides the edited pot by the edited servings, in the same shape", () => {
    // A servings-only edit: the stored pot is unchanged, and the contract's
    // per-serving figure follows the new count on the next read.
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
    expect(served.per_serving).toEqual(perServing(row));
    expect(served.per_serving.kcal).toBe(300);
  });
});
