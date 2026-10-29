import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  NO_FILTER,
  NO_PICKS,
  cuisinesIn,
  dietSatisfies,
  hasPicks,
  matchesFilter,
  readPicks,
  tagWithPicks,
} from "@/lib/tuning";
import { generatePrompt } from "@/lib/reroll";
import { EMPTY_META, type RecipeMeta } from "@/lib/metadata";
import type { Macros } from "@/lib/macros";

/**
 * The tuning section (2026-09-26): pickers that steer a draft and
 * come back tagged on it, and the same options as filters on the book.
 */

const pot: Macros = { kcal: 2400, protein_g: 180, carbs_g: 120, fat_g: 100 };

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

describe("the time filter uses prep plus cook (TEC-189)", () => {
  const f = { ...NO_FILTER, max_minutes: 45 };
  it("sums prep and cook", () => {
    expect(matchesFilter(recipe({ prep_minutes: 15, cook_minutes: 30 }), f)).toBe(true);
    expect(matchesFilter(recipe({ prep_minutes: 15, cook_minutes: 31 }), f)).toBe(false);
  });
  it("counts whichever is set, and prefers them to the old total", () => {
    expect(matchesFilter(recipe({ prep_minutes: 10 }), f)).toBe(true);
    expect(matchesFilter(recipe({ cook_minutes: 60, total_minutes: 20 }), f)).toBe(false);
  });
  it("falls back to the old total when neither is set, and never matches when nothing is", () => {
    expect(matchesFilter(recipe({ total_minutes: 40 }), f)).toBe(true);
    expect(matchesFilter(recipe({ total_minutes: 50 }), f)).toBe(false);
    expect(matchesFilter(recipe(), f)).toBe(false);
  });
  it("the Ask Claude note reckons the same sum", () => {
    const picks = { ...NO_PICKS, max_minutes: 30 };
    expect(tagWithPicks({ ...EMPTY_META, prep_minutes: 10, cook_minutes: 15 }, picks).notes).toEqual([]);
    expect(tagWithPicks({ ...EMPTY_META, prep_minutes: 20, cook_minutes: 30 }, picks).notes[0]).toContain("50 min");
  });
});

describe("the book has no High protein filter (TEC-189)", () => {
  it("its filter is the four picks and nothing more", () => {
    expect(Object.keys(NO_FILTER).sort()).toEqual(["cuisine", "diet", "max_minutes", "meal"]);
    expect(readFileSync(resolve(__dirname, "../app/Tuning.tsx"), "utf8")).not.toMatch(/High protein/i);
  });
});
