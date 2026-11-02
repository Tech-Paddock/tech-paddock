// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MacroTab from "@/app/MacroTab";
import { EMPTY_META } from "@/lib/metadata";
import { hydrate, servingLabel, toServingRows, type Recipe } from "@/lib/recipes";
import { isEstimated, NOT_ESTIMATED, perServing, servingOrNull } from "@/lib/recipeSteps";
import { macrosLine, menuServingLine } from "@/lib/recipeView";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **A recipe saved before its macros are estimated** (TEC-200). The four macros
 * and the source are null together, and every reader has to treat that as a state
 * of its own: said out loud, skipped in arithmetic, and never a 0.
 */

function recipe(over: Partial<Recipe> = {}): Recipe {
  return {
    id: "r1",
    name: "Weeknight chilli",
    servings: 6,
    kcal: 2400,
    protein_g: 180,
    carbs_g: 120,
    fat_g: 100,
    origin: "imported",
    source: "estimate",
    model: "claude-haiku-4-5",
    source_url: null,
    ingredients: ["500g beef mince"],
    method: null,
    note: null,
    created_at: "2026-11-02T00:00:00Z",
    ...EMPTY_META,
    ...over,
  };
}

const NONE = { kcal: null, protein_g: null, carbs_g: null, fat_g: null, source: null, model: null } as const;

describe("reading a row with no macros", () => {
  const row = {
    id: "r2",
    name: "Pistachio Creami (jello)",
    servings: 1,
    kcal: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    origin: "imported",
    source: null,
    model: null,
    ingredients: ["pistachio pudding mix"],
  };

  it("keeps the four macros null, where Number(null) would have made them 0", () => {
    const r = hydrate(row);
    expect([r.kcal, r.protein_g, r.carbs_g, r.fat_g]).toEqual([null, null, null, null]);
    expect(r.source).toBeNull();
    expect(isEstimated(r)).toBe(false);
  });

  it("still turns the strings PostgREST sends for a numeric column into numbers", () => {
    const r = hydrate({ ...row, kcal: "2400.00", protein_g: "180.00", carbs_g: "120.00", fat_g: "100.00", source: "estimate", model: "m" });
    expect([r.kcal, r.protein_g, r.carbs_g, r.fat_g]).toEqual([2400, 180, 120, 100]);
    expect(r.source).toBe("estimate");
    expect(isEstimated(r)).toBe(true);
  });

  it("a real zero is a figure, not 'not estimated'", () => {
    const r = hydrate({ ...row, kcal: "0", protein_g: "0", carbs_g: "0", fat_g: "0", source: "hand" });
    expect(isEstimated(r)).toBe(true);
    expect(r.kcal).toBe(0);
  });

  it("one missing macro makes the whole pot not estimated, never half a pot", () => {
    const r = hydrate({ ...row, kcal: "500", protein_g: null, carbs_g: "10", fat_g: "5", source: "estimate" });
    expect([r.kcal, r.protein_g, r.carbs_g, r.fat_g, r.source]).toEqual([null, null, null, null, null]);
  });
});

describe("per-serving maths skips an unestimated recipe", () => {
  it("servingOrNull is null, not zeros", () => {
    expect(servingOrNull(recipe(NONE))).toBeNull();
    expect(servingLabel(recipe(NONE))).toBeNull();
  });

  it("an estimated recipe divides as before", () => {
    expect(servingOrNull(recipe())).toEqual(perServing({ servings: 6, kcal: 2400, protein_g: 180, carbs_g: 120, fat_g: 100 }));
    expect(servingLabel(recipe())).toEqual({ kcal: 400, protein_g: 30, carbs_g: 20, fat_g: 17 });
  });
});

describe("the list and the menu", () => {
  it("the recipe list's macros line says not estimated, never 0 kcal", () => {
    const line = macrosLine(servingOrNull(recipe(NONE)));
    expect(line).toBe("Macros not estimated yet");
    expect(line).not.toMatch(/\d/);
  });

  it("the menu row says the same", () => {
    expect(menuServingLine(servingOrNull(recipe(NONE)))).toBe(NOT_ESTIMATED);
    expect(menuServingLine({ kcal: 519.6, protein_g: 38.2, carbs_g: 41.5, fat_g: 18 })).toBe(
      "520 cal · 38g P · 18g F · 42g C /serv",
    );
  });

  it("menu totals over a mix of recipes count only the estimated ones", () => {
    // The shape any total takes: ask for the serving, skip the nulls.
    const day = [recipe(), recipe(NONE), recipe({ kcal: 1200 })];
    const kcal = day.map(servingOrNull).reduce((sum, s) => sum + (s ? s.kcal : 0), 0);
    expect(kcal).toBe(400 + 200);
  });
});

describe("the open recipe's Macros tab", () => {
  it("says Macros not estimated yet, with no tiles, no split and no provenance", () => {
    const html = renderToStaticMarkup(createElement(MacroTab, { recipe: recipe(NONE) }));
    expect(html).toContain("Macros not estimated yet");
    expect(html).not.toMatch(/kcal|Whole pot|One serving|Estimated|Yours/);
    expect(html).not.toMatch(/\b0g\b/);
  });

  it("an estimated recipe still shows its tiles", () => {
    const html = renderToStaticMarkup(createElement(MacroTab, { recipe: recipe() }));
    expect(html).toContain("One serving (of 6)");
    expect(html).toContain("Whole pot: 2400 kcal");
    expect(html).not.toContain("not estimated");
  });
});

describe("GET /api/servings", () => {
  it("leaves an unestimated recipe out and keeps the response shape", () => {
    const rows = toServingRows([recipe({ id: "a" }), recipe({ ...NONE, id: "b" }), recipe({ id: "c" })]);
    expect(rows.map((r) => r.id)).toEqual(["a", "c"]);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(["id", "name", "per_serving", "servings"]);
      expect(Object.values(row.per_serving).every((n) => typeof n === "number")).toBe(true);
    }
  });

  it("a book of only unestimated recipes is an empty list, not a list of zeros", () => {
    expect(toServingRows([recipe(NONE), recipe({ ...NONE, id: "b" })])).toEqual([]);
  });
});

describe("the migration", () => {
  const sql = readFileSync(
    resolve(__dirname, "../../../supabase/migrations/20261102001000_cookbook_recipe_macros_optional.sql"),
    "utf8",
  );
  const code = sql.replace(/^--.*$/gm, "");

  it("is additive: nothing is dropped but the constraint it widens", () => {
    expect(code).not.toMatch(/drop\s+(table|column|schema|type)/i);
    expect([...code.matchAll(/drop\s+constraint\s+(\w+)/gi)].map((m) => m[1])).toEqual(["recipe_model_matches_source"]);
    expect(code).not.toMatch(/\b(delete|truncate)\b/i);
  });

  it("frees the four macros and source together and ties them with one constraint", () => {
    for (const col of ["kcal", "protein_g", "carbs_g", "fat_g", "source"]) {
      expect(code).toMatch(new RegExp(`alter column ${col}\\s+drop not null`));
    }
    expect(code).toMatch(/recipe_macros_together/);
  });

  it("adds imported_original as nullable jsonb", () => {
    expect(code).toMatch(/add column imported_original jsonb;/);
  });
});
