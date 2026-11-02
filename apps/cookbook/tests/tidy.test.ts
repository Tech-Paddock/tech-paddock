import { describe, expect, it, vi } from "vitest";
import { draftView, keepDraft, makeDraft, readOriginal, revertToImported, tidySource, type KeepDeps, type TidyDraft } from "@/lib/tidy";
import { EMPTY_META } from "@/lib/metadata";
import { normalizeName, type Recipe } from "@/lib/recipes";
import { ConflictError, InputError } from "@/lib/errors";
import { keepSummary, servingsInput, tidySummary } from "@/lib/tidyView";

/**
 * Tidy (TEC-201), with the model and the database replaced by fakes. What has to
 * hold: a draft never writes a recipe; keeping prices the recipe through the
 * ingredient-edit path; a failed estimate still keeps the tidy; Revert only puts
 * the import back; and no recipe ever changes name. Invented recipes only.
 */

const IMPORTED = {
  ingredients: ["1 cup onions, chopped", "2 tablespoons olive oil"],
  directions: "Cook the onions in the oil.",
  yield_text: "",
  source_text: "somewhere",
};

const row: Recipe = {
  id: "r1",
  name: "Onion pot",
  servings: 4,
  origin: "imported",
  source: null,
  model: null,
  source_url: null,
  ingredients: ["1 cup onions, chopped", "2 tablespoons olive oil"],
  method: "Cook the onions in the oil.",
  note: null,
  created_at: "2026-11-01T00:00:00Z",
  kcal: null,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
  ...EMPTY_META,
  rating: 4,
};

const STYLED = { ingredients: ["1 cup onion", "2 tbsp olive oil"], method: "1. Chop the onion.\n2. Cook it in the oil.", servings: 6 };

function draftDeps(over: Record<string, unknown> = {}) {
  return {
    getRecipe: vi.fn(async () => row),
    getOriginal: vi.fn(async () => IMPORTED as unknown),
    style: vi.fn(async () => STYLED),
    saveDraft: vi.fn(async (_d: TidyDraft) => {}),
    ...over,
  };
}

describe("what Tidy reads", () => {
  it("reads imported_original when it is set, else the current row", () => {
    expect(tidySource(row, IMPORTED).ingredients).toEqual(IMPORTED.ingredients);
    expect(tidySource({ ...row, ingredients: ["3 eggs"], method: "Boil." }, null)).toMatchObject({
      ingredients: ["3 eggs"],
      method: "Boil.",
      fromOriginal: false,
    });
  });

  it("reads the original's shape generously", () => {
    expect(readOriginal({ ingredients: "a\nb", method: ["Do one.", "Do two."], yield_text: 6 })).toEqual({
      ingredients: ["a", "b"],
      method: "Do one.\nDo two.",
      yieldText: "6",
      servings: null,
    });
    expect(readOriginal({ ingredients: [] })).toBeNull();
    expect(readOriginal("nope")).toBeNull();
    expect(readOriginal(null)).toBeNull();
  });

  it.each([
    ["", true],
    ["a crowd", true],
    ["9x13 pan", true],
    ["Serves 6", false],
    ["4", false],
  ])("servings are estimated for an imported recipe whose yield is %j: %s", (yield_text, estimate) => {
    expect(tidySource(row, { ...IMPORTED, yield_text }).estimateServings).toBe(estimate);
  });

  it("never estimates servings for a recipe that was not imported", () => {
    expect(tidySource(row, null).estimateServings).toBe(false);
  });
});

describe("a draft never writes a recipe", () => {
  it("saves one draft and nothing else; the model reads the imported text, not the row", async () => {
    const deps = draftDeps();
    const draft = await makeDraft(deps, "r1");
    expect(deps.saveDraft).toHaveBeenCalledTimes(1);
    expect(deps.style).toHaveBeenCalledWith({
      name: "Onion pot",
      servings: 4,
      ingredients: IMPORTED.ingredients,
      method: IMPORTED.directions,
      estimateServings: true,
    });
    expect(draft).toEqual({
      recipe_id: "r1",
      ingredients: STYLED.ingredients,
      method: STYLED.method,
      servings: 6,
      servings_estimated: true,
    });
  });

  it("has no name in it, so a tidy cannot rename a recipe", async () => {
    const draft = await makeDraft(draftDeps(), "r1");
    expect(Object.keys(draft).sort()).toEqual(["ingredients", "method", "recipe_id", "servings", "servings_estimated"]);
  });

  it("keeps the recipe's servings, unmarked, where the yield gave a count", async () => {
    const draft = await makeDraft(draftDeps({ getOriginal: async () => ({ ...IMPORTED, yield_text: "Serves 4" }) }), "r1");
    expect(draft.servings).toBe(4);
    expect(draft.servings_estimated).toBe(false);
  });

  it("a restyle that fails saves no draft", async () => {
    const deps = draftDeps({
      style: vi.fn(async () => {
        throw new Error("changed the recipe");
      }),
    });
    await expect(makeDraft(deps, "r1")).rejects.toThrow(/changed the recipe/);
    expect(deps.saveDraft).not.toHaveBeenCalled();
  });

  it("a recipe that is gone is a refusal", async () => {
    await expect(makeDraft(draftDeps({ getRecipe: async () => null }), "r1")).rejects.toBeInstanceOf(InputError);
  });

  it("the review sees what was read beside what is proposed", async () => {
    const draft = await makeDraft(draftDeps(), "r1");
    const view = draftView(draft, row, IMPORTED);
    expect(view.before.ingredients).toEqual(IMPORTED.ingredients);
    expect(view.after.ingredients).toEqual(STYLED.ingredients);
    expect(view.servings_estimated).toBe(true);
    expect(view.name).toBe("Onion pot");
  });
});

describe("keeping a draft", () => {
  const draft: TidyDraft = { recipe_id: "r1", ingredients: STYLED.ingredients, method: STYLED.method, servings: 6, servings_estimated: true };
  const pot = { kcal: 1800, protein_g: 40, carbs_g: 260, fat_g: 70 };

  function keepDeps(over: Record<string, unknown> = {}) {
    const base = {
      getRecipe: vi.fn(async () => row),
      getDraft: vi.fn(async () => draft as TidyDraft | null),
      deleteDraft: vi.fn(async () => {}),
      nameTakenByOther: vi.fn(async () => false),
      normalizeName,
      estimate: vi.fn(async () => ({ macros: pot, note: "assumed 1 tbsp oil" })),
      update: vi.fn(async () => "written"),
    } satisfies KeepDeps<string> as KeepDeps<string> & { update: ReturnType<typeof vi.fn>; estimate: ReturnType<typeof vi.fn>; deleteDraft: ReturnType<typeof vi.fn> };
    return { ...base, ...over } as typeof base;
  }

  it("writes the tidy and prices the whole pot at once, as an ingredient edit does", async () => {
    const deps = keepDeps();
    const result = await keepDraft(deps, "r1");

    expect(deps.estimate).toHaveBeenCalledTimes(1);
    expect(deps.estimate).toHaveBeenCalledWith(expect.objectContaining({ ingredients: STYLED.ingredients, servings: 6 }));
    expect(deps.update).toHaveBeenCalledTimes(1);
    expect(deps.update).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ ingredients: STYLED.ingredients, method: STYLED.method, servings: 6 }),
      { macros: pot, model: "claude-sonnet-5-5", note: "assumed 1 tbsp oil" },
      { styled: true }
    );
    expect(deps.deleteDraft).toHaveBeenCalledWith("r1");
    expect(result).toEqual({ recipe: "written", estimated: true });
  });

  it("prices even when the ingredient text is the same as the row's", async () => {
    const deps = keepDeps({ getDraft: async () => ({ ...draft, ingredients: row.ingredients }) });
    await keepDraft(deps, "r1");
    expect(deps.estimate).toHaveBeenCalledTimes(1);
  });

  it("never changes the name, and keeps the rating", async () => {
    const deps = keepDeps({ getRecipe: async () => ({ ...row, name: "Granny's onion pot" }) });
    await keepDraft(deps, "r1");
    const edit = (deps.update.mock.calls[0] as unknown as [string, { name: string; meta: { rating: number } }])[1];
    expect(edit.name).toBe("Granny's onion pot");
    expect(edit.meta.rating).toBe(4);
  });

  it("takes an edited servings count only for a draft whose servings were a guess", async () => {
    const guessed = keepDeps();
    await keepDraft(guessed, "r1", { servings: 8 });
    expect((guessed.update.mock.calls[0] as unknown as [string, { servings: number }])[1].servings).toBe(8);

    const counted = keepDeps({ getDraft: async () => ({ ...draft, servings: 4, servings_estimated: false }) });
    await keepDraft(counted, "r1", { servings: 8 });
    expect((counted.update.mock.calls[0] as unknown as [string, { servings: number }])[1].servings).toBe(4);

    const junk = keepDeps();
    await keepDraft(junk, "r1", { servings: "lots" });
    expect((junk.update.mock.calls[0] as unknown as [string, { servings: number }])[1].servings).toBe(6);
  });

  it("a failed estimate still keeps the tidy, with the macros back to not estimated", async () => {
    const deps = keepDeps({
      estimate: vi.fn(async () => {
        throw new Error("ran out of room");
      }),
    });
    const result = await keepDraft(deps, "r1");

    expect(result).toEqual({ recipe: "written", estimated: false });
    expect(deps.update).toHaveBeenCalledTimes(1);
    expect(deps.update).toHaveBeenCalledWith("r1", expect.objectContaining({ ingredients: STYLED.ingredients }), null, {
      styled: true,
      clearMacros: true,
    });
    expect(deps.deleteDraft).toHaveBeenCalledWith("r1");
  });

  it("a refusal that is not the model keeps nothing and leaves the draft", async () => {
    const refusing = keepDeps({
      update: vi.fn(async () => {
        throw new ConflictError("taken");
      }),
    });
    await expect(keepDraft(refusing, "r1")).rejects.toBeInstanceOf(ConflictError);
    // Not the model's failure, so no second, macro-less write, and the draft stays for another try.
    expect(refusing.update).toHaveBeenCalledTimes(1);
    expect(refusing.deleteDraft).not.toHaveBeenCalled();
  });

  it("a draft that is gone is a refusal and writes nothing", async () => {
    const deps = keepDeps({ getDraft: async () => null });
    await expect(keepDraft(deps, "r1")).rejects.toBeInstanceOf(InputError);
    expect(deps.update).not.toHaveBeenCalled();
    expect(deps.estimate).not.toHaveBeenCalled();
  });
});

describe("Revert", () => {
  function revertDeps(over: Record<string, unknown> = {}) {
    return {
      getRecipe: vi.fn(async () => ({ id: "r1", servings: 6 })),
      getOriginal: vi.fn(async () => IMPORTED as unknown),
      write: vi.fn(async () => "reverted"),
      deleteDraft: vi.fn(async () => {}),
      ...over,
    };
  }

  it("puts back the imported ingredients and method, and drops any draft", async () => {
    const deps = revertDeps();
    expect(await revertToImported(deps, "r1")).toBe("reverted");
    expect(deps.write).toHaveBeenCalledWith("r1", {
      ingredients: IMPORTED.ingredients,
      method: IMPORTED.directions,
      servings: 6,
    });
    expect(deps.deleteDraft).toHaveBeenCalledWith("r1");
  });

  it("servings come from the import: its own count, else the yield's, else what the recipe has", async () => {
    const fromYield = revertDeps({ getOriginal: async () => ({ ...IMPORTED, yield_text: "Serves 3" }) });
    await revertToImported(fromYield, "r1");
    expect((fromYield.write.mock.calls[0] as unknown as [string, { servings: number }])[1].servings).toBe(3);

    const fromCount = revertDeps({ getOriginal: async () => ({ ...IMPORTED, servings: 2, yield_text: "Serves 3" }) });
    await revertToImported(fromCount, "r1");
    expect((fromCount.write.mock.calls[0] as unknown as [string, { servings: number }])[1].servings).toBe(2);
  });

  it("a recipe with no import cannot be reverted, and nothing is written", async () => {
    const deps = revertDeps({ getOriginal: async () => null });
    await expect(revertToImported(deps, "r1")).rejects.toBeInstanceOf(InputError);
    expect(deps.write).not.toHaveBeenCalled();
  });
});

describe("the review's words", () => {
  it("reads a servings box as a count from 1 to 99, else nothing", () => {
    expect(servingsInput(" 6 ")).toBe(6);
    for (const bad of ["", "0", "100", "4.5", "four", "-2"]) expect(servingsInput(bad)).toBeNull();
  });

  it("says what was made and what was not", () => {
    expect(tidySummary(90, 5, false)).toBe("90 drafts ready to review · 5 recipes couldn't be tidied and stay as they are");
    expect(tidySummary(1, 0, true)).toBe("1 draft ready to review · stopped early");
  });

  it("says what was kept and what still needs a hand", () => {
    expect(keepSummary(10, 0, 0)).toBe("10 recipes kept");
    expect(keepSummary(10, 2, 1)).toContain("2 with macros not estimated yet");
    expect(keepSummary(10, 2, 1)).toContain("1 couldn't be kept and are still drafts");
  });
});
