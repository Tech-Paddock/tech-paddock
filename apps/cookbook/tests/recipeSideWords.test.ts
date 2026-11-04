import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipeCard } from "@/app/Book";
import EditRecipe from "@/app/EditRecipe";
import MacroTab from "@/app/MacroTab";
import type { Recipe } from "@/lib/recipes";

/**
 * TEC-207: price lives with Deals and the grocery list, never with a recipe. The
 * recipe side says "estimate macros". Money wording on the grocery list and Deals
 * is untouched, so this names the recipe-side files rather than scanning the app.
 *
 * It reads each file whole (strings, labels, errors and comments alike), then
 * renders the screens a recipe shows, so a word added later fails here.
 */

const MONEY = /pric(e|es|ed|ing)|re-?pric|re-?cost|dollar/i;

const RECIPE_SIDE = [
  "app/AddRecipe.tsx",
  "app/Book.tsx",
  "app/EditRecipe.tsx",
  "app/MacroTab.tsx",
  "app/Menu.tsx",
  "app/Meta.tsx",
  "app/Provenance.tsx",
  "app/RecipeDetail.tsx",
  "app/api/recipes/draft/route.ts",
  "app/api/recipes/edit/route.ts",
  "app/api/recipes/revert/route.ts",
  "app/api/recipes/route.ts",
  "app/api/servings/route.ts",
  "lib/anthropic.ts",
  "lib/edit.ts",
  "lib/houseStyle.ts",
  "lib/imported.ts",
  "lib/importedStore.ts",
  "lib/macros.ts",
  "lib/metadata.ts",
  "lib/models.ts",
  "lib/recipeSteps.ts",
  "lib/recipeView.ts",
  "lib/recipes.ts",
  "lib/upload.ts",
];

describe("the recipe side never says price", () => {
  it.each(RECIPE_SIDE)("%s", (file) => {
    const lines = readFileSync(file, "utf8").split("\n");
    const hits = lines.map((l, i) => ({ l, n: i + 1 })).filter(({ l }) => MONEY.test(l));
    expect(hits.map(({ n, l }) => `${file}:${n} ${l.trim()}`)).toEqual([]);
  });

  const recipe: Recipe = {
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
    has_original: true,
  };
  const noop = () => {};

  it("the screens a recipe shows say estimate macros", () => {
    const edit = renderToStaticMarkup(createElement(EditRecipe, { recipe, onSaved: noop, onCancel: noop }));
    expect(edit).not.toMatch(MONEY);
    // The button that clears the macros only shows once the ingredients or servings change, which a static render cannot do.
    expect(readFileSync("app/EditRecipe.tsx", "utf8")).toContain("Save and clear macros");

    const macros = renderToStaticMarkup(createElement(MacroTab, { recipe }));
    expect(macros).toContain("Macros not estimated yet");
    expect(macros).not.toMatch(MONEY);

    const card = renderToStaticMarkup(
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
        onRevert: noop,
      })
    );
    expect(card).not.toMatch(MONEY);
  });
});

describe("the recipe Tidy is gone, and the grocery list's stays", () => {
  it("has no recipe tidy files, routes or screen", () => {
    for (const gone of ["app/TidyReview.tsx", "lib/tidy.ts", "lib/tidyStore.ts", "lib/tidyView.ts", "app/api/recipes/tidy/route.ts", "app/api/recipes/tidy/keep/route.ts"]) {
      expect(() => readFileSync(gone)).toThrow();
    }
  });

  it("nothing in the app touches the tidy drafts table", () => {
    for (const file of [...RECIPE_SIDE, "lib/grocery.ts", "lib/cartSends.ts", "app/List.tsx"]) {
      expect(readFileSync(file, "utf8")).not.toContain("recipe_tidy_drafts");
    }
  });

  it("the grocery list still has its Tidy route", () => {
    expect(readFileSync("app/api/grocery/tidy/route.ts", "utf8")).toContain("tidyList");
  });
});
