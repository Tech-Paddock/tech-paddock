import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
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
  "app/Tuning.tsx",
  "app/api/recipes/draft/route.ts",
  "app/api/recipes/edit/route.ts",
  "app/api/recipes/revert/route.ts",
  "app/api/recipes/route.ts",
  "app/api/servings/route.ts",
  "lib/anthropic.ts",
  "lib/bookRead.ts",
  "lib/breakdown.ts",
  "lib/edit.ts",
  "lib/greyedRows.ts",
  "lib/houseStyle.ts",
  "lib/imported.ts",
  "lib/importedStore.ts",
  "lib/macros.ts",
  "lib/metadata.ts",
  "lib/models.ts",
  "lib/recipeSort.ts",
  "lib/recipeSteps.ts",
  "lib/recipeView.ts",
  "lib/recipes.ts",
  "lib/scaleServings.ts",
  "lib/upload.ts",
];

/**
 * Every other source file in app/ and lib/: the grocery list, Deals, Your brands,
 * the Kroger plumbing and the shared shell. Money wording is allowed in these.
 * A file in neither list fails "every source file is placed", so a new recipe-side
 * file cannot be missed: whoever adds a file puts it in one list.
 */
const NOT_RECIPE_SIDE = [
  "app/Brands.tsx",
  "app/Cart.tsx",
  "app/Cookbook.tsx",
  "app/DealsTab.tsx",
  "app/ItemMatches.tsx",
  "app/List.tsx",
  "app/LogoutControl.tsx",
  "app/SearchField.tsx",
  "app/Shell.tsx",
  "app/ThemeControl.tsx",
  "app/Toast.tsx",
  "app/add/page.tsx",
  "app/api/brands/default/route.ts",
  "app/api/brands/export/route.ts",
  "app/api/brands/import/route.ts",
  "app/api/brands/preview/route.ts",
  "app/api/brands/route.ts",
  "app/api/brands/successor/route.ts",
  "app/api/coupons/route.ts",
  "app/api/cron/prices/route.ts",
  "app/api/deals/route.ts",
  "app/api/grocery/route.ts",
  "app/api/grocery/tidy/route.ts",
  "app/api/health/route.ts",
  "app/api/kroger/cart/back-to-list/route.ts",
  "app/api/kroger/cart/clear/route.ts",
  "app/api/kroger/cart/refresh/route.ts",
  "app/api/kroger/cart/route.ts",
  "app/api/kroger/check/route.ts",
  "app/api/kroger/deals/route.ts",
  "app/api/kroger/matches/route.ts",
  "app/api/kroger/mirror/route.ts",
  "app/api/kroger/refresh/route.ts",
  "app/api/kroger/route.ts",
  "app/api/kroger/store/route.ts",
  "app/api/login/route.ts",
  "app/api/logout/route.ts",
  "app/api/menu/route.ts",
  "app/api/purchases/route.ts",
  "app/api/recipes/grocery/route.ts",
  "app/api/version/route.ts",
  "app/brands/page.tsx",
  "app/deals/page.tsx",
  "app/kroger/callback/route.ts",
  "app/kroger/connect/route.ts",
  "app/layout.tsx",
  "app/list/page.tsx",
  "app/login/page.tsx",
  "app/page.tsx",
  "app/useMirror.ts",
  "lib/auth.ts",
  "lib/bestPrice.ts",
  "lib/brandBatch.ts",
  "lib/brandGroups.ts",
  "lib/brandImport.ts",
  "lib/brands.ts",
  "lib/cart.ts",
  "lib/cartGuess.ts",
  "lib/cartRefresh.ts",
  "lib/cartSends.ts",
  "lib/checkLine.ts",
  "lib/couponRules.ts",
  "lib/couponStore.ts",
  "lib/coupons.ts",
  "lib/cronAuth.ts",
  "lib/dealBoard.ts",
  "lib/dealFilter.ts",
  "lib/dealRows.ts",
  "lib/dealRun.ts",
  "lib/dealSignal.ts",
  "lib/dealStore.ts",
  "lib/decide.ts",
  "lib/errors.ts",
  "lib/fetchRun.ts",
  "lib/grocery.ts",
  "lib/groceryText.ts",
  "lib/image.ts",
  "lib/itemMatches.ts",
  "lib/itemWords.ts",
  "lib/kingsoopers.ts",
  "lib/kroger.ts",
  "lib/krogerCheck.ts",
  "lib/krogerConnection.ts",
  "lib/krogerCrypto.ts",
  "lib/krogerState.ts",
  "lib/krogerStore.ts",
  "lib/lineDeal.ts",
  "lib/linePick.ts",
  "lib/lineQuantity.ts",
  "lib/lineView.ts",
  "lib/listDeals.ts",
  "lib/listOrder.ts",
  "lib/listPrices.ts",
  "lib/livery.ts",
  "lib/login.ts",
  "lib/logout.ts",
  "lib/menu.ts",
  "lib/menuDay.ts",
  "lib/mirror.ts",
  "lib/mirrorLimit.ts",
  "lib/mirrorWords.ts",
  "lib/modality.ts",
  "lib/password.ts",
  "lib/preferences.ts",
  "lib/priceDates.ts",
  "lib/priceRun.ts",
  "lib/priceStore.ts",
  "lib/priceWeeks.ts",
  "lib/pricing.ts",
  "lib/productStore.ts",
  "lib/purchaseStore.ts",
  "lib/purchases.ts",
  "lib/refresh.ts",
  "lib/refreshDue.ts",
  "lib/refreshNote.ts",
  "lib/refreshRun.ts",
  "lib/reroll.ts",
  "lib/respond.ts",
  "lib/safe-redirect.ts",
  "lib/sizeDrift.ts",
  "lib/sizeFit.ts",
  "lib/stoplight.ts",
  "lib/supabase.ts",
  "lib/tabs.ts",
  "lib/takeBack.ts",
  "lib/theme.ts",
  "lib/tuning.ts",
  "lib/typedLines.ts",
];

describe("the recipe side never says price", () => {
  it("every source file is placed in one list or the other", () => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) found.push(p);
      }
    };
    walk("app");
    walk("lib");
    const placed = new Set([...RECIPE_SIDE, ...NOT_RECIPE_SIDE]);
    expect(found.filter((f) => !placed.has(f)).sort()).toEqual([]);
    expect([...placed].filter((f) => !found.includes(f)).sort()).toEqual([]);
    expect(RECIPE_SIDE.filter((f) => NOT_RECIPE_SIDE.includes(f))).toEqual([]);
  });

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
