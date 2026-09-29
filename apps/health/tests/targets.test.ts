import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  kcalOf, targetFor, setCalories, setMacro, remaining, parseTargetInput, isPlausiblyToday,
  type Split,
} from "@/lib/targets";

/**
 * TEC-53's four commitments, approved by Joel on 2026-09-19, as tests: a target
 * is effective-dated; the split clamps at zero; none of it calls a model; and
 * (in the migration and `lib/entries.ts`) deleting a meal never deletes the
 * food. Plus his answers of 2026-09-29: no backdating, the lock is remembered.
 */

const t = (effective_from: string, created_at: string, protein_g = 150) =>
  ({ id: `${effective_from}/${created_at}`, effective_from, created_at, protein_g, carbs_g: 200, fat_g: 60, locked: [] });

describe("targetFor — a target is dated", () => {
  const feb = t("2026-02-01", "2026-02-01T08:00:00Z", 140);
  const mar = t("2026-03-01", "2026-03-01T08:00:00Z", 180);

  it("scores February against February's target after March's is set", () => {
    expect(targetFor([feb, mar], "2026-02-20")?.protein_g).toBe(140);
    expect(targetFor([feb, mar], "2026-03-01")?.protein_g).toBe(180);
    expect(targetFor([mar, feb], "2026-09-29")?.protein_g).toBe(180);
  });

  it("a day before any target has none — never a fallback, never zero", () => {
    expect(targetFor([feb, mar], "2026-01-31")).toBeNull();
    expect(targetFor([], "2026-09-29")).toBeNull();
  });

  it("two targets set the same day: the later one wins", () => {
    const again = t("2026-03-01", "2026-03-01T19:00:00Z", 200);
    expect(targetFor([again, mar], "2026-03-05")?.protein_g).toBe(200);
  });
});

describe("rebalancing — grams are the truth and nothing goes below zero", () => {
  const split: Split = { protein_g: 150, carbs_g: 200, fat_g: 60 }; // 600 + 800 + 540 = 1940

  it("derives calories from grams", () => {
    expect(kcalOf(split)).toBe(1940);
  });

  it("new calories are shared by the unlocked macros; a locked one holds", () => {
    const { split: next, clamped } = setCalories(split, 2240, ["protein_g"]);
    expect(next.protein_g).toBe(150);
    expect(clamped).toBe(false);
    // 1640 kcal of carbs and fat, split 800:540 as before.
    expect(next.carbs_g).toBe(Math.round((1640 * 800) / 1340 / 4));
    expect(next.fat_g).toBe(Math.round((1640 * 540) / 1340 / 9));
    expect(Math.abs(kcalOf(next) - 2240)).toBeLessThanOrEqual(9);
  });

  it("calories below what is locked clamp the rest at zero and say so", () => {
    const { split: next, clamped } = setCalories(split, 400, ["protein_g"]);
    expect(clamped).toBe(true);
    expect(next).toEqual({ protein_g: 150, carbs_g: 0, fat_g: 0 });
    // The screen shows what is reachable, 600, not the 400 that was typed.
    expect(kcalOf(next)).toBe(600);
  });

  it("with every macro locked, calories move nothing", () => {
    expect(setCalories(split, 3000, ["protein_g", "carbs_g", "fat_g"]).split).toEqual(split);
  });

  it("from nothing, calories spread evenly by calorie", () => {
    const { split: next } = setCalories({ protein_g: 0, carbs_g: 0, fat_g: 0 }, 1800, []);
    expect(next).toEqual({ protein_g: 150, carbs_g: 150, fat_g: 67 });
  });

  it("raising one macro holds the calories: the other unlocked one gives", () => {
    const { split: next, clamped } = setMacro(split, "protein_g", 200, ["fat_g"]);
    expect(clamped).toBe(false);
    expect(next.protein_g).toBe(200);
    expect(next.fat_g).toBe(60);
    expect(next.carbs_g).toBe(150);
    expect(kcalOf(next)).toBe(1940);
  });

  it("raising one macro past what the others can give clamps them at zero", () => {
    const { split: next, clamped } = setMacro(split, "protein_g", 600, []);
    expect(clamped).toBe(true);
    expect(next).toEqual({ protein_g: 600, carbs_g: 0, fat_g: 0 });
    expect(Object.values(next).every((g) => g >= 0)).toBe(true);
  });

  it("a negative typed gram is zero, never negative", () => {
    expect(setMacro(split, "fat_g", -20, []).split.fat_g).toBe(0);
    expect(setCalories(split, -100, []).split).toEqual({ protein_g: 0, carbs_g: 0, fat_g: 0 });
  });

  it("with no other macro unlocked, the calories move instead", () => {
    const { split: next } = setMacro(split, "carbs_g", 250, ["protein_g", "fat_g"]);
    expect(next).toEqual({ protein_g: 150, carbs_g: 250, fat_g: 60 });
    expect(kcalOf(next)).toBe(2140);
  });
});

describe("remaining — signed, so over is an answer", () => {
  const target: Split = { protein_g: 150, carbs_g: 200, fat_g: 60 };

  it("is target minus eaten, and goes negative when over", () => {
    const left = remaining(target, { kcal: 2000, protein_g: 100, carbs_g: 220, fat_g: 60 });
    expect(left).toEqual({ kcal: -60, protein_g: 50, carbs_g: -20, fat_g: 0 });
  });
});

describe("parseTargetInput — from today, never backdated", () => {
  const now = new Date("2026-09-29T15:00:00Z");
  const ok = { protein_g: 150, carbs_g: 200, fat_g: 60, locked: ["fat_g"], effective_from: "2026-09-29" };

  it("accepts today, and keeps the lock so it is remembered", () => {
    expect(parseTargetInput(ok, now)).toEqual({ ...ok, locked: ["fat_g"] });
  });

  it("accepts the phone's today a timezone either side of UTC's", () => {
    expect(isPlausiblyToday("2026-09-28", now)).toBe(true);
    expect(isPlausiblyToday("2026-09-30", now)).toBe(true);
  });

  it("refuses a backdate or a forward date", () => {
    expect(parseTargetInput({ ...ok, effective_from: "2026-09-01" }, now)).toHaveProperty("error");
    expect(parseTargetInput({ ...ok, effective_from: "2026-10-05" }, now)).toHaveProperty("error");
    expect(parseTargetInput({ ...ok, effective_from: "yesterday" }, now)).toHaveProperty("error");
  });

  it("refuses negative grams, a target of nothing, and an unknown lock", () => {
    expect(parseTargetInput({ ...ok, fat_g: -1 }, now)).toHaveProperty("error");
    expect(parseTargetInput({ ...ok, protein_g: 0, carbs_g: 0, fat_g: 0 }, now)).toHaveProperty("error");
    expect(parseTargetInput({ ...ok, locked: ["kcal"] }, now)).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// No model call anywhere in it — held by walking the imports, not by trust.
// ---------------------------------------------------------------------------

const APP = resolve(__dirname, "..");

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(APP, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Couldn't resolve "${spec}" from ${from}`);
}

/** Every file and package an entry point reaches, following local imports. */
function reach(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [join(APP, entry)];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (files.has(file)) continue;
    files.add(file);
    const source = readFileSync(file, "utf8");
    for (const m of source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)) {
      const next = resolveImport(file, m[1]);
      if (next) queue.push(next);
      else packages.add(m[1]);
    }
  }
  return { files, packages };
}

const callsAModel = (entry: string) => {
  const { files, packages } = reach(entry);
  return [...files].some((f) => f.endsWith("/lib/anthropic.ts")) ||
    [...packages].some((p) => p.startsWith("@anthropic-ai/"));
};

describe("none of it calls a model", () => {
  it.each([
    "app/api/targets/route.ts",
    "app/api/entries/[id]/route.ts",
    "app/targets/page.tsx",
    "app/LeftToday.tsx",
    "lib/targets.ts",
    "lib/targetStore.ts",
    "lib/entries.ts",
  ])("%s reaches no model client", (entry) => {
    expect(callsAModel(entry)).toBe(false);
  });

  it("the walk is not vacuous: the parse route does reach the model", () => {
    expect(callsAModel("app/api/parse/route.ts")).toBe(true);
  });
});

describe("deleting a meal never deletes the food", () => {
  it("only entry_items cascades from entries; nothing cascades to items or versions", () => {
    const deleted = readFileSync(join(APP, "lib/entries.ts"), "utf8");
    const code = deleted.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(code).toContain('.from("entries")');
    expect(code).not.toMatch(/from\("(items|item_versions|entry_items)"\)/);
  });
});
