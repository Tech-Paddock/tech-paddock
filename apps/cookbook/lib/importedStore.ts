import { getServiceClient } from "./supabase";
import { InputError, LookupError } from "./errors";
import { COLUMNS, hydrate, type Recipe } from "./recipes";
import type { RevertFields } from "./imported";

/**
 * Revert's database side (TEC-201, kept by TEC-207). The rules are in
 * `lib/imported.ts`; this file only reads `recipes.imported_original` and does
 * Revert's one write.
 *
 * **Nothing here writes `imported_original`**: a trigger refuses to change it once
 * set. **Nothing in the app reads or writes the old tidy-drafts table any
 * more**; a follow-on migration drops it.
 */

/** `imported_original` for one recipe, as stored; null when the recipe was not imported. */
export async function getOriginal(id: string): Promise<unknown> {
  const { data, error } = await getServiceClient().from("recipes").select("imported_original").eq("id", id).maybeSingle();
  if (error) throw new LookupError(`Couldn't read that recipe: ${error.message}`);
  return (data as { imported_original?: unknown } | null)?.imported_original ?? null;
}

/**
 * Revert's one write: the import's ingredients, method and servings, the macros
 * back to "not estimated yet" (with their source, model and caveat), and the
 * house-style mark cleared. `imported_original` is not in the update.
 */
export async function revertRecipe(id: string, fields: RevertFields): Promise<Recipe> {
  const { data, error } = await getServiceClient()
    .from("recipes")
    .update({
      ingredients: fields.ingredients,
      method: fields.method,
      servings: fields.servings,
      kcal: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      source: null,
      model: null,
      note: null,
      house_style_at: null,
    })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new LookupError(`Couldn't put that recipe back: ${error.message}`);
  if (!data) throw new InputError("That recipe is not in the book any more.");
  return hydrate(data as Record<string, unknown>);
}
