import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MacroTab from "@/app/MacroTab";
import { RecipeCard } from "@/app/Book";
import { readOriginal, revertToImported } from "@/lib/imported";
import { InputError } from "@/lib/errors";
import type { Recipe } from "@/lib/recipes";

/**
 * Revert (TEC-201, kept by TEC-207 when the recipe Tidy
 * went). The model and the database are fakes. Revert only puts the import back;
 * the Macros tab offers the estimate for a recipe that has none. Invented text.
 */

const noop = () => {};

const IMPORTED = {
  ingredients: ["1 cup onions, chopped", "2 tablespoons olive oil"],
  directions: "Cook the onions in the oil.",
  yield_text: "",
  source_text: "somewhere",
};

describe("reading imported_original", () => {
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
});

describe("Revert", () => {
  function revertDeps(over: Record<string, unknown> = {}) {
    return {
      getRecipe: vi.fn(async () => ({ id: "r1", servings: 6 })),
      getOriginal: vi.fn(async () => IMPORTED as unknown),
      write: vi.fn(async () => "reverted"),
      ...over,
    };
  }

  it("puts back the imported ingredients and method", async () => {
    const deps = revertDeps();
    expect(await revertToImported(deps, "r1")).toBe("reverted");
    expect(deps.write).toHaveBeenCalledWith("r1", {
      ingredients: IMPORTED.ingredients,
      method: IMPORTED.directions,
      servings: 6,
    });
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

const unestimated: Recipe = {
  id: "r1",
  name: "Onion pot",
  servings: 4,
  origin: "imported",
  source: null,
  model: null,
  source_url: null,
  ingredients: ["1 cup onion"],
  method: "1. Chop the onion.",
  note: null,
  created_at: "2026-11-01T00:00:00Z",
  kcal: null,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
  total_minutes: null,
  prep_minutes: null,
  cook_minutes: null,
  meal: null,
  mains: [],
  cuisine: null,
  equipment: [],
  diet: [],
  tags: [],
  rating: null,
};

describe("Macros not estimated yet", () => {
  it("says so and offers no button: the nightly job fills them in (TEC-223)", () => {
    const html = renderToStaticMarkup(createElement(MacroTab, { recipe: unestimated }));
    expect(html).toContain("Macros not estimated yet");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Estimate macros");
  });
});

describe("where Revert shows", () => {
  const card = (recipe: Recipe, onRevert?: () => void) =>
    renderToStaticMarkup(
      createElement(RecipeCard, {
        recipe,
        open: true,
        listing: false,
        rating: false,
        onToggle: noop,
        onList: noop,
        onRate: noop,
        onRemove: noop,
        onEdited: noop,
        onRevert,
      })
    );

  it("shows on a recipe that has an import to go back to", () => {
    expect(card({ ...unestimated, has_original: true }, noop)).toContain("Revert to imported");
  });

  it("does not show on a recipe that was never imported", () => {
    expect(card({ ...unestimated, has_original: false }, noop)).not.toContain("Revert to imported");
  });
});
