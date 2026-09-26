import { describe, expect, it } from "vitest";
import {
  NO_FILTER,
  NO_PICKS,
  cuisinesIn,
  dietSatisfies,
  hasPicks,
  isHighProtein,
  matchesFilter,
  readPicks,
  tagWithPicks,
} from "@/lib/tuning";
import { generatePrompt } from "@/lib/reroll";
import { EMPTY_META, type RecipeMeta } from "@/lib/metadata";
import type { Macros } from "@/lib/macros";

/**
 * The tuning section (Joel, 2026-09-26, "Both"): pickers that steer a draft and
 * come back tagged on it, and the same options as filters on the book, with
 * high protein computed from the numbers rather than stored.
 */

const pot: Macros = { kcal: 2400, protein_g: 180, carbs_g: 120, fat_g: 100 }; // 30% protein

function recipe(over: Partial<RecipeMeta & Macros> = {}): RecipeMeta & Macros {
  return { ...EMPTY_META, ...pot, ...over };
}

describe("reading the picks off a request", () => {
  it("keeps what is on a list and drops what is not", () => {
    expect(readPicks({ meal: "Dinner", diet: "vegan", cuisine: " Thai ", max_minutes: "30" })).toEqual({
      meal: "dinner",
      diet: "vegan",
      cuisine: "thai",
      max_minutes: 30,
    });
    expect(readPicks({ meal: "brunch", diet: "gluten-free", max_minutes: 25 })).toEqual(NO_PICKS);
    expect(readPicks(undefined)).toEqual(NO_PICKS);
  });

  it("knows when nothing is picked", () => {
    expect(hasPicks(NO_PICKS)).toBe(false);
    expect(hasPicks({ ...NO_PICKS, max_minutes: 30 })).toBe(true);
  });
});

describe("the picks in the generate prompt", () => {
  it("are requirements, each one said", () => {
    const prompt = generatePrompt("something warming", [], "", {
      meal: "dinner",
      diet: "vegetarian",
      cuisine: "thai",
      max_minutes: 30,
    });
    expect(prompt).toContain("What they asked for: something warming");
    expect(prompt).toContain("It is a dinner.");
    expect(prompt).toContain("It is vegetarian — every ingredient");
    expect(prompt).toContain("The cuisine is thai.");
    expect(prompt).toContain("under 30 minutes");
  });

  it("stand in for the brief when there is none", () => {
    const prompt = generatePrompt("", [], "", { ...NO_PICKS, meal: "breakfast" });
    expect(prompt).toContain("anything that meets the requirements below");
  });

  it("add nothing when nothing is picked — the old prompt is unchanged", () => {
    expect(generatePrompt("a side")).not.toContain("Requirements");
  });
});

describe("the draft comes back tagged with what was picked", () => {
  it("meal and cuisine are written on", () => {
    const { meta, notes } = tagWithPicks({ ...EMPTY_META, meal: "lunch", cuisine: "fusion" }, {
      ...NO_PICKS,
      meal: "dinner",
      cuisine: "thai",
    });
    expect(meta.meal).toBe("dinner");
    expect(meta.cuisine).toBe("thai");
    expect(notes).toEqual([]);
  });

  it("diet is never written on — it stands only where the model agrees, and says so where it does not", () => {
    // A "vegetarian" label on a dish with fish sauce in it is the one wrong tag
    // here someone would act on.
    const agreed = tagWithPicks({ ...EMPTY_META, diet: ["vegan"] }, { ...NO_PICKS, diet: "vegetarian" });
    expect(agreed.meta.diet).toEqual(["vegan"]);
    expect(agreed.notes).toEqual([]);

    const not = tagWithPicks(EMPTY_META, { ...NO_PICKS, diet: "vegetarian" });
    expect(not.meta.diet).toEqual([]);
    expect(not.notes[0]).toContain("did not mark this one vegetarian");
  });

  it("time stays the model's estimate; an overrun or no time is noted", () => {
    const over = tagWithPicks({ ...EMPTY_META, total_minutes: 45 }, { ...NO_PICKS, max_minutes: 30 });
    expect(over.meta.total_minutes).toBe(45);
    expect(over.notes[0]).toContain("45 min");
    expect(tagWithPicks(EMPTY_META, { ...NO_PICKS, max_minutes: 30 }).notes[0]).toContain("gave no time");
    expect(tagWithPicks({ ...EMPTY_META, total_minutes: 25 }, { ...NO_PICKS, max_minutes: 30 }).notes).toEqual([]);
  });
});

describe("filters on the book", () => {
  it("dinner + vegetarian + under 30 minutes: every one must hold", () => {
    const f = { ...NO_FILTER, meal: "dinner" as const, diet: "vegetarian" as const, max_minutes: 30 };
    expect(matchesFilter(recipe({ meal: "dinner", diet: ["vegetarian"], total_minutes: 25 }), f)).toBe(true);
    expect(matchesFilter(recipe({ meal: "lunch", diet: ["vegetarian"], total_minutes: 25 }), f)).toBe(false);
    expect(matchesFilter(recipe({ meal: "dinner", diet: [], total_minutes: 25 }), f)).toBe(false);
    expect(matchesFilter(recipe({ meal: "dinner", diet: ["vegetarian"], total_minutes: 40 }), f)).toBe(false);
  });

  it("a recipe with the detail unset never matches a filter on it", () => {
    expect(matchesFilter(recipe(), { ...NO_FILTER, max_minutes: 90 })).toBe(false);
    expect(matchesFilter(recipe(), { ...NO_FILTER, meal: "dinner" })).toBe(false);
  });

  it("no filter shows everything, set or not", () => {
    expect(matchesFilter(recipe(), NO_FILTER)).toBe(true);
  });

  it("a vegan dish is vegetarian and pescatarian-friendly; the reverse is not so", () => {
    expect(dietSatisfies(["vegan"], "vegetarian")).toBe(true);
    expect(dietSatisfies(["vegetarian"], "pescatarian")).toBe(true);
    expect(dietSatisfies(["pescatarian"], "vegetarian")).toBe(false);
    expect(dietSatisfies(["vegetarian"], "vegan")).toBe(false);
  });

  it("cuisines offered are the book's own, once each, sorted", () => {
    expect(cuisinesIn([{ cuisine: "thai" }, { cuisine: null }, { cuisine: "mexican" }, { cuisine: "thai" }])).toEqual([
      "mexican",
      "thai",
    ]);
  });
});

describe("high protein is computed from the numbers, never a tag", () => {
  it("is at least 30% of the calories from protein", () => {
    expect(isHighProtein(pot)).toBe(true);
    expect(isHighProtein({ ...pot, protein_g: 170 })).toBe(false);
  });

  it("does not change with the servings count — a share, not grams a serving", () => {
    const perBowl = { kcal: pot.kcal / 8, protein_g: pot.protein_g / 8, carbs_g: 0, fat_g: 0 };
    expect(isHighProtein(perBowl)).toBe(isHighProtein(pot));
  });

  it("follows a re-price, because nothing about it is stored", () => {
    const before = recipe();
    const after = recipe({ protein_g: 60 });
    const f = { ...NO_FILTER, high_protein: true };
    expect(matchesFilter(before, f)).toBe(true);
    expect(matchesFilter(after, f)).toBe(false);
  });

  it("a zero-calorie row is not high anything", () => {
    expect(isHighProtein({ kcal: 0, protein_g: 10, carbs_g: 0, fat_g: 0 })).toBe(false);
  });
});
