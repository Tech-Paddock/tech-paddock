import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  DIETS,
  MEALS,
  META_PROMPT,
  META_SCHEMA_PROPERTIES,
  formatMinutes,
  readList,
  readMeta,
  refusedWord,
  timeMinutes,
  timeParts,
} from "@/lib/metadata";
import { generatePrompt } from "@/lib/reroll";

/**
 * Recipe metadata (TEC-52). These rules are binding, and these are the
 * tests that hold them: **no allergen or gluten-free claim, no macro-derived
 * tag, and a rating only a person sets.**
 */

describe("no allergen or free-of claim is storable", () => {
  it("drops a free-of tag in any spelling", () => {
    const meta = readMeta(
      { tags: ["Gluten-Free", "dairy free", "nut-free", "free from eggs", "allergen friendly", "one-pot"] },
      { rating: false }
    );
    expect(meta.tags).toEqual(["one-pot"]);
  });

  it("drops one from diet, mains and equipment too", () => {
    const meta = readMeta(
      { diet: ["gluten-free", "vegetarian"], mains: ["gluten-free pasta", "chicken"], equipment: ["allergen-safe pan"] },
      { rating: false }
    );
    expect(meta.diet).toEqual(["vegetarian"]);
    expect(meta.mains).toEqual(["chicken"]);
    expect(meta.equipment).toEqual([]);
  });

  it("keeps free-range, which is how the hen lived rather than what the dish lacks", () => {
    expect(readMeta({ mains: ["free-range eggs", "free range chicken"] }, { rating: false }).mains).toEqual([
      "free-range eggs",
      "free range chicken",
    ]);
    expect(refusedWord("free-range, gluten-free")).toBe("free-of");
  });

  it("keeps diet to what a dish is: a closed list", () => {
    expect(DIETS).toEqual(["vegetarian", "vegan", "pescatarian"]);
    expect(readMeta({ diet: ["Vegan", "keto", "paleo", "halal"] }, { rating: false }).diet).toEqual(["vegan"]);
  });

  it("the model is told never to make the claim, and to ignore a page's badge", () => {
    expect(META_PROMPT).toMatch(/Never say what the dish is free of/);
  });
});

describe("macro-derived filters are computed, never tagged", () => {
  it("drops a nutrition tag", () => {
    const tags = readMeta(
      { tags: ["High Protein", "low-carb", "keto", "low cal", "lean", "light", "30g protein", "weeknight"] },
      { rating: false }
    ).tags;
    expect(tags).toEqual(["weeknight"]);
  });

  it("but only among tags: a main that names what you buy stays", () => {
    // "Lean beef" is a thing in the shop, not a claim about the numbers.
    expect(readMeta({ mains: ["lean beef"] }, { rating: false }).mains).toEqual(["lean beef"]);
    expect(refusedWord("lean")).toBe("macro");
  });
});

describe("the rating is the user's", () => {
  it("is thrown away off a model, whatever it says", () => {
    expect(readMeta({ rating: 5 }, { rating: false }).rating).toBeNull();
  });

  it("is a whole number from 1 to 5 when a person sets it", () => {
    expect(readMeta({ rating: 4 }, { rating: true }).rating).toBe(4);
    expect(readMeta({ rating: "3" }, { rating: true }).rating).toBe(3);
    for (const bad of [0, 6, 3.5, "five", -1]) {
      expect(readMeta({ rating: bad }, { rating: true }).rating).toBeNull();
    }
  });

  it("is never asked of a model", () => {
    expect(Object.keys(META_SCHEMA_PROPERTIES)).not.toContain("rating");
    expect(META_PROMPT).not.toMatch(/rating/i);
    expect(generatePrompt("a quick side")).not.toMatch(/rating/i);
  });
});

describe("reading the rest", () => {
  it("lowercases, trims, de-duplicates and caps a list, from an array or a comma string", () => {
    expect(readList(["Chicken", " chicken ", "Spinach"])).toEqual(["chicken", "spinach"]);
    expect(readList("Oven,  slow   cooker ,")).toEqual(["oven", "slow cooker"]);
    expect(readList(Array.from({ length: 20 }, (_, i) => `tag ${i}`))).toHaveLength(8);
    expect(readList([42, null, "x".repeat(41)])).toEqual([]);
  });

  it("moves a diet word typed as a tag into diet", () => {
    const meta = readMeta({ tags: ["vegetarian", "one-pot"] }, { rating: false });
    expect(meta.diet).toEqual(["vegetarian"]);
    expect(meta.tags).toEqual(["one-pot"]);
  });

  it("takes a meal only from the list", () => {
    expect(readMeta({ meal: "Dinner" }, { rating: false }).meal).toBe("dinner");
    expect(readMeta({ meal: "brunch" }, { rating: false }).meal).toBeNull();
  });

  it("takes minutes as a whole number up to two days", () => {
    expect(readMeta({ total_minutes: "35" }, { rating: false }).total_minutes).toBe(35);
    expect(readMeta({ total_minutes: 44.6 }, { rating: false }).total_minutes).toBe(45);
    for (const bad of [0, -5, 2881, "soon", null]) {
      expect(readMeta({ total_minutes: bad }, { rating: false }).total_minutes).toBeNull();
    }
  });

  it("reads prep and cook the same way, each on its own (TEC-189)", () => {
    const m = readMeta({ prep_minutes: "15", cook_minutes: 29.6 }, { rating: false });
    expect([m.prep_minutes, m.cook_minutes, m.total_minutes]).toEqual([15, 30, null]);
    for (const bad of [0, -5, 2881, "soon", null]) {
      expect(readMeta({ prep_minutes: bad, cook_minutes: bad }, { rating: false })).toMatchObject({
        prep_minutes: null,
        cook_minutes: null,
      });
    }
  });

  it("reads nothing as nothing, not as an error", () => {
    expect(readMeta(null, { rating: true })).toEqual({
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
    });
  });
});

describe("the pill", () => {
  it("says the time the way you would", () => {
    expect(formatMinutes(35)).toBe("35 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(90)).toBe("1 h 30");
    expect(formatMinutes(null)).toBeNull();
  });
});

describe("prep and cook time (TEC-189)", () => {
  it("is asked of a model as two fields, not one total", () => {
    const keys = Object.keys(META_SCHEMA_PROPERTIES);
    expect(keys).toContain("prep_minutes");
    expect(keys).toContain("cook_minutes");
    expect(keys).not.toContain("total_minutes");
    expect(META_PROMPT).toMatch(/"prep_minutes"/);
    expect(META_PROMPT).toMatch(/"cook_minutes"/);
  });

  it("the time is prep plus cook, whichever is set, else the old total", () => {
    const none = { total_minutes: null, prep_minutes: null, cook_minutes: null };
    expect(timeMinutes({ ...none, prep_minutes: 15, cook_minutes: 30 })).toBe(45);
    expect(timeMinutes({ ...none, prep_minutes: 10 })).toBe(10);
    expect(timeMinutes({ ...none, cook_minutes: 20, total_minutes: 99 })).toBe(20);
    expect(timeMinutes({ ...none, total_minutes: 35 })).toBe(35);
    expect(timeMinutes(none)).toBeNull();
  });

  it("is said as Prep and Cook, and the total only when neither is set", () => {
    const none = { total_minutes: null, prep_minutes: null, cook_minutes: null };
    expect(timeParts({ ...none, prep_minutes: 15, cook_minutes: 30 })).toEqual(["Prep 15m", "Cook 30m"]);
    expect(timeParts({ ...none, prep_minutes: 5 })).toEqual(["Prep 5m"]);
    expect(timeParts({ ...none, cook_minutes: 90 })).toEqual(["Cook 1h 30m"]);
    expect(timeParts({ ...none, prep_minutes: 5, total_minutes: 35 })).toEqual(["Prep 5m"]);
    expect(timeParts({ ...none, total_minutes: 35 })).toEqual(["35 min"]);
    expect(timeParts(none)).toEqual([]);
  });

  describe("the migration", () => {
    const dir = resolve(__dirname, "../../../supabase/migrations");
    const file = readdirSync(dir).find((f) => f.endsWith("_cookbook_prep_cook_minutes.sql"));
    const sql = file ? readFileSync(resolve(dir, file), "utf8") : "";
    const statements = sql.replace(/--.*$/gm, "");

    it("exists, is additive, and drops nothing (total_minutes stays)", () => {
      expect(file).toBeDefined();
      expect(sql).toMatch(/Shape: \*\*additive\.\*\*/);
      expect(statements).not.toMatch(/\b(drop|rename|update|delete|truncate)\b/i);
    });

    it("adds exactly two nullable columns with the same bounds as total_minutes", () => {
      const names = [...statements.matchAll(/add column (\w+)/gi)].map((m) => m[1]);
      expect(names).toEqual(["prep_minutes", "cook_minutes"]);
      expect(statements).not.toMatch(/not null/i);
      expect(statements.match(/> 0 and \w+ <= 2880/g)).toHaveLength(2);
    });
  });
});

describe("the migration behind it", () => {
  const dir = resolve(__dirname, "../../../supabase/migrations");
  const file = readdirSync(dir).find((f) => f.endsWith("_cookbook_recipe_metadata.sql"));
  const sql = file ? readFileSync(resolve(dir, file), "utf8") : "";
  const statements = sql.replace(/--.*$/gm, "");

  it("exists, and says it is additive", () => {
    expect(file).toBeDefined();
    expect(sql).toMatch(/Shape: \*\*additive\.\*\*/);
  });

  it("only adds: no drop, no rename, no data written", () => {
    expect(statements).not.toMatch(/\b(drop|rename|update|delete|truncate)\b/i);
  });

  it("gives every new column a value existing rows already satisfy", () => {
    // A `not null` column without a default would fail on the rows already in
    // the book — the one way this file could stop being additive.
    const columns = statements.match(/add column [^,;]+/gi) ?? [];
    expect(columns).toHaveLength(8);
    for (const c of columns) {
      if (/not null/i.test(c)) expect(c).toMatch(/default/i);
    }
  });

  it("holds the same vocabularies as the code", () => {
    // The check constraints and `lib/metadata.ts` disagreeing would mean a value
    // the app thinks is fine and the database refuses.
    const quoted = (list: string) => [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(quoted(statements.match(/meal in \(([^)]*)\)/)?.[1] ?? "")).toEqual([...MEALS]);
    expect(quoted(statements.match(/diet <@ array\[([^\]]*)\]/)?.[1] ?? "")).toEqual([...DIETS]);
    expect(statements).toMatch(/rating between 1 and 5/);
  });

  it("has no allergen or free-of column", () => {
    // The column names, not the comments — the comments say why there is none.
    const names = [...statements.matchAll(/add column (\w+)/gi)].map((m) => m[1]);
    expect(names).toEqual(["total_minutes", "meal", "mains", "cuisine", "equipment", "diet", "tags", "rating"]);
    expect(names.join(" ")).not.toMatch(/allergen|gluten|free/i);
  });
});
