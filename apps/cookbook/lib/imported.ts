import { yieldCount } from "./houseStyle";
import { InputError } from "./errors";
import type { Recipe } from "./recipes";

/**
 * Revert (TEC-201, kept by TEC-207): put a recipe back as it was imported.
 *
 * **Pure: no database, no model, no Next.** The route hands in what it needs as
 * deps, so the rules below have tests without either. **It only ever reads
 * `imported_original`** (a trigger refuses to change it once set). The recipe
 * Tidy that once wrote drafts is gone (TEC-207); the house style
 * (`lib/houseStyle.ts`) still applies on every way in, and `house_style_at`
 * still marks the recipes it was applied to.
 */

/** The recipe as imported, read leniently out of `imported_original`. */
export type Original = {
  ingredients: string[];
  method: string | null;
  yieldText: string | null;
  servings: number | null;
};

/** One line per string, from a list or from text. */
function lines(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : [];
  return raw.map((l) => (typeof l === "string" ? l.trim() : "")).filter(Boolean);
}

/**
 * The imported recipe out of `imported_original` (a jsonb object written at
 * load: ingredients, directions, yield text and source text), or null when it
 * holds no ingredients to work from. The shape is read generously, because the
 * load is not this code: `ingredients` as a list or as text; the method as
 * `directions`, `method` or `instructions`, text or a list of steps.
 */
export function readOriginal(original: unknown): Original | null {
  if (!original || typeof original !== "object" || Array.isArray(original)) return null;
  const o = original as Record<string, unknown>;

  const ingredients = lines(o.ingredients);
  if (ingredients.length === 0) return null;

  const rawMethod = o.directions ?? o.method ?? o.instructions;
  const method = (Array.isArray(rawMethod) ? lines(rawMethod).join("\n") : typeof rawMethod === "string" ? rawMethod.trim() : "") || null;

  const yieldText = typeof o.yield_text === "string" ? o.yield_text : typeof o.yield_text === "number" ? String(o.yield_text) : null;
  const servings = typeof o.servings === "number" && Number.isInteger(o.servings) && o.servings >= 1 ? o.servings : null;

  return { ingredients, method, yieldText, servings };
}

/** The fields Revert puts back. The macros and the mark go with them in the write. */
export type RevertFields = { ingredients: string[]; method: string | null; servings: number };

export type RevertDeps<R> = {
  getRecipe: (id: string) => Promise<Pick<Recipe, "id" | "servings"> | null>;
  getOriginal: (id: string) => Promise<unknown>;
  /** One write: these fields, macros/source/model/note null, `house_style_at` null. */
  write: (id: string, fields: RevertFields) => Promise<R>;
};

/**
 * Put the imported recipe back. **It only reads `imported_original`.** Servings
 * are the import's own where it holds one, else the yield text's count, else
 * whatever the recipe has now.
 */
export async function revertToImported<R>(deps: RevertDeps<R>, id: string): Promise<R> {
  const recipe = await deps.getRecipe(id);
  if (!recipe) throw new InputError("That recipe is not in the book any more.");
  const original = readOriginal(await deps.getOriginal(id));
  if (!original) throw new InputError("That recipe has no imported version to go back to.");

  return deps.write(id, {
    ingredients: original.ingredients,
    method: original.method,
    servings: original.servings ?? yieldCount(original.yieldText) ?? recipe.servings,
  });
}
