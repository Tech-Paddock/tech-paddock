import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipeCard } from "@/app/Book";
import { RecipeOpen, AddToListCard } from "@/app/RecipeDetail";
import type { Recipe } from "@/lib/recipes";

const recipe: Recipe = {
  id: "r1",
  name: "Green curry",
  servings: 4,
  origin: "generated",
  source: "estimate",
  model: "claude-sonnet-5-5",
  source_url: null,
  ingredients: ["2 tbsp curry paste", "Salt, to taste"],
  method: "1. Fry the paste. 2. Add the coconut milk and simmer.",
  note: null,
  created_at: "2026-10-01T00:00:00Z",
  kcal: 2000,
  protein_g: 120,
  carbs_g: 160,
  fat_g: 90,
  total_minutes: null,
  prep_minutes: 15,
  cook_minutes: 30,
  meal: "dinner",
  mains: ["chicken"],
  cuisine: "thai",
  equipment: ["one pot"],
  diet: ["vegetarian"],
  tags: ["workmight"],
  rating: 5,
};

const noop = () => {};
function card(r: Recipe, open: boolean) {
  return renderToStaticMarkup(
    createElement(RecipeCard, {
      recipe: r,
      open,
      listing: false,
      rating: false,
      onToggle: noop,
      onList: noop,
      onRate: noop,
      onRemove: noop,
      onEdited: noop,
    }),
  );
}
function openTab(tab: "ingredients" | "method" | "macros") {
  return renderToStaticMarkup(
    createElement(RecipeOpen, { recipe, tab, onTab: noop, onRate: noop, rating: false }),
  );
}

describe("the recipe on the list (TEC-189)", () => {
  const html = card(recipe, false);
  it("is the name, then 5★ · Prep · Cook · makes N, then one serving as text", () => {
    expect(html).toContain("Green curry");
    expect(html).toContain("5★");
    expect(html).toMatch(/ · Prep 15m · Cook 30m · makes 4/);
    expect(html).toContain("500 kcal · 30p · 40c · 23f");
  });
  it("has no macro tiles on the list", () => {
    expect(html).not.toContain("grid-cols-4");
    expect(html).not.toContain(">protein<");
  });
  it("drops the rating when unrated, and shows the old total only with no prep or cook", () => {
    const unrated = card({ ...recipe, rating: null }, false);
    expect(unrated).not.toContain("★");
    expect(unrated).toContain("Prep 15m");
    const legacy = card({ ...recipe, prep_minutes: null, cook_minutes: null, total_minutes: 35 }, false);
    expect(legacy).toContain("35 min · makes 4");
    expect(legacy).not.toContain("Prep");
    expect(card({ ...recipe, total_minutes: 35 }, false)).not.toContain("35 min");
  });
  it("shows none of meal, main, cuisine, equipment, diet or tags", () => {
    for (const word of ["dinner", "chicken", "thai", "one pot", "vegetarian", "workmight"]) {
      expect(html).not.toContain(word);
    }
  });
});

describe("the open recipe", () => {
  const html = card(recipe, true);
  it("opens on Ingredients, with the three tabs in a tablist", () => {
    expect(html).toContain('role="tablist"');
    expect(html).toMatch(/aria-selected="true"[^>]*>Ingredients</);
    expect(html).toMatch(/aria-selected="false"[^>]*>Method</);
    expect(html).toMatch(/aria-selected="false"[^>]*>Macros</);
    expect(html).toContain("curry paste");
    expect(html).not.toContain("Fry the paste");
  });
  it("puts the amount in its own cell and leaves a plain line whole", () => {
    expect(html).toContain(">2 tbsp<");
    expect(html).toContain(">curry paste<");
    expect(html).toContain(">Salt, to taste<");
  });
  it("shows the rating up top as five stars with N of 5", () => {
    expect(html).toContain("5 of 5");
    expect(html).toContain("Clear the rating of 5");
    expect(card({ ...recipe, rating: null }, true)).toContain("Not rated");
  });
  it("renders no keywords and no helpings estimator", () => {
    for (const word of ["dinner", "chicken", "thai", "one pot", "vegetarian", "workmight", "elpings"]) {
      expect(html).not.toContain(word);
    }
    expect(html).not.toContain("Macro breakdown");
  });
  it("switches: each tab shows its own panel and marks itself selected", () => {
    const method = openTab("method");
    expect(method).toMatch(/aria-selected="true"[^>]*>Method</);
    expect(method).toContain("Fry the paste.");
    expect(method).toContain("Add the coconut milk");
    expect(method).not.toContain("curry paste");

    const macros = openTab("macros");
    expect(macros).toMatch(/aria-selected="true"[^>]*>Macros</);
    expect(macros).toContain("Calories from each");
    expect(macros).toContain("Whole pot: 2000 kcal");
    expect(macros).toContain("Estimated");
    expect(macros).not.toContain("Fry the paste");
  });
});

describe("the Add to list card", () => {
  const render = () =>
    renderToStaticMarkup(
      createElement(AddToListCard, {
        name: "Green curry",
        hasIngredients: true,
        listing: false,
        onList: noop,
        onEdit: noop,
        onRemove: noop,
        today: "2026-10-28",
      }),
    );
  it("asks when with one date box that opens on today, not chips", () => {
    const html = render();
    expect(html).toContain("When are you cooking it?");
    expect(html).toContain('type="date"');
    expect(html).toContain('value="2026-10-28"');
    for (const label of ["Today", "Tomorrow", "Friday", "Pick a date"]) {
      expect(html).not.toContain(label);
    }
    expect(html).not.toContain("aria-pressed");
  });
  it("has Add to list, Edit and Remove", () => {
    const html = render();
    expect(html).toContain(">Add to list<");
    expect(html).toContain(">Edit<");
    expect(html).toContain(">Remove<");
  });
  it("carries no pricing note", () => {
    expect(render().toLowerCase()).not.toContain("pricing");
  });
});
