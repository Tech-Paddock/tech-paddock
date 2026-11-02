import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewList } from "@/app/TidyReview";
import MacroTab from "@/app/MacroTab";
import { RecipeCard } from "@/app/Book";
import type { TidyDraftView } from "@/lib/tidy";
import type { Recipe } from "@/lib/recipes";

/**
 * The review screen's draft list, the retry on "Macros not estimated yet", and
 * where Revert shows (TEC-201). Server-rendered, as the other screen tests are:
 * there is no click harness here.
 */

const noop = () => {};

const counted: TidyDraftView = {
  id: "a",
  name: "Onion pot",
  before: { ingredients: ["1 cup onions, chopped"], method: "Cook.", servings: 4, yield_text: "Serves 4" },
  after: { ingredients: ["1 cup onion"], method: "1. Chop the onion.\n2. Cook.", servings: 4 },
  servings_estimated: false,
};
const guessed: TidyDraftView = {
  ...counted,
  id: "b",
  name: "Bean stew",
  before: { ...counted.before, yield_text: "" },
  after: { ...counted.after, servings: 6 },
  servings_estimated: true,
};

function list(over: Partial<Parameters<typeof ReviewList>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(ReviewList, {
      drafts: [counted, guessed],
      unticked: new Set<string>(),
      edits: {},
      openId: null,
      onTick: noop,
      onEdit: noop,
      onOpen: noop,
      ...over,
    })
  );
}

describe("the review list", () => {
  it("has every draft ticked to start with", () => {
    const html = list();
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html.match(/checked=""/g)).toHaveLength(2);
  });

  it("unticks only the ones asked", () => {
    expect(list({ unticked: new Set(["a"]) }).match(/checked=""/g)).toHaveLength(1);
  });

  it("marks estimated servings in words, with a box to change them, and only on those", () => {
    const html = list();
    expect(html).toContain("Servings estimated");
    expect(html.match(/Servings estimated/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Servings for Bean stew"');
    expect(html).not.toContain('aria-label="Servings for Onion pot"');
    expect(html).toContain('value="6"');
  });

  it("shows an edit the owner typed, not the estimate", () => {
    expect(list({ edits: { b: "8" } })).toContain('value="8"');
  });

  it("opens to before and after for one recipe", () => {
    const closed = list();
    expect(closed).not.toContain("Before");
    const open = list({ openId: "a" });
    expect(open).toContain("Before");
    expect(open).toContain("After");
    expect(open).toContain("1 cup onions, chopped");
    expect(open).toContain("1 cup onion");
    expect(open).toContain("Chop the onion.");
  });
});

const unpriced: Recipe = {
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
  it("offers a retry when something can take the result", () => {
    const html = renderToStaticMarkup(createElement(MacroTab, { recipe: unpriced, onEstimated: noop }));
    expect(html).toContain("Macros not estimated yet");
    expect(html).toContain("Estimate macros");
  });

  it("offers none where nothing is listening", () => {
    expect(renderToStaticMarkup(createElement(MacroTab, { recipe: unpriced }))).not.toContain("Estimate macros");
  });
});

describe("Revert", () => {
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
    expect(card({ ...unpriced, has_original: true }, noop)).toContain("Revert to imported");
  });

  it("does not show on a recipe that was never imported", () => {
    expect(card({ ...unpriced, has_original: false }, noop)).not.toContain("Revert to imported");
  });
});
