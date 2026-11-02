import { getServiceClient } from "./supabase";
import { InputError, LookupError } from "./errors";
import { COLUMNS, hydrate, type Recipe } from "./recipes";
import type { RevertFields, TidyDraft } from "./tidy";

/**
 * Tidy's database side (TEC-201). The rules are in `lib/tidy.ts`; this file only
 * reads and writes `cookbook.recipe_tidy_drafts` and `recipes.imported_original`.
 *
 * **Nothing here writes `imported_original`**: a trigger refuses to change it once
 * set, and Tidy and Revert only read it. **Nothing here writes a recipe except
 * `revertRecipe`**, the one tap that puts the import back.
 */

const DRAFT_COLUMNS = "recipe_id, ingredients, method, servings, servings_estimated";

function hydrateDraft(row: Record<string, unknown>): TidyDraft {
  return {
    recipe_id: String(row.recipe_id),
    ingredients: Array.isArray(row.ingredients) ? (row.ingredients as string[]) : [],
    method: typeof row.method === "string" ? row.method : null,
    servings: Number(row.servings),
    servings_estimated: row.servings_estimated === true,
  };
}

export async function listDrafts(): Promise<TidyDraft[]> {
  const { data, error } = await getServiceClient().from("recipe_tidy_drafts").select(DRAFT_COLUMNS).order("created_at");
  if (error) throw new LookupError(`Couldn't read the tidy drafts: ${error.message}`);
  return (data ?? []).map((r) => hydrateDraft(r as Record<string, unknown>));
}

export async function getDraft(id: string): Promise<TidyDraft | null> {
  const { data, error } = await getServiceClient().from("recipe_tidy_drafts").select(DRAFT_COLUMNS).eq("recipe_id", id).maybeSingle();
  if (error) throw new LookupError(`Couldn't read that tidy draft: ${error.message}`);
  return data ? hydrateDraft(data as Record<string, unknown>) : null;
}

/** One draft per recipe: a second Tidy replaces the first. */
export async function saveDraft(draft: TidyDraft): Promise<void> {
  const { error } = await getServiceClient()
    .from("recipe_tidy_drafts")
    .upsert(
      {
        recipe_id: draft.recipe_id,
        ingredients: draft.ingredients,
        method: draft.method,
        servings: draft.servings,
        servings_estimated: draft.servings_estimated,
        created_at: new Date().toISOString(),
      },
      { onConflict: "recipe_id" }
    );
  if (error) throw new LookupError(`Couldn't save that tidy draft: ${error.message}`);
}

export async function deleteDraft(id: string): Promise<void> {
  const { error } = await getServiceClient().from("recipe_tidy_drafts").delete().eq("recipe_id", id);
  if (error) throw new LookupError(`Couldn't discard that tidy draft: ${error.message}`);
}

/** Discard these drafts; each one is only a proposal, so nothing else changes. */
export async function deleteDrafts(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await getServiceClient().from("recipe_tidy_drafts").delete().in("recipe_id", ids);
  if (error) throw new LookupError(`Couldn't discard those tidy drafts: ${error.message}`);
}

/** `imported_original` for one recipe, as stored; null when the recipe was not imported. */
export async function getOriginal(id: string): Promise<unknown> {
  const { data, error } = await getServiceClient().from("recipes").select("imported_original").eq("id", id).maybeSingle();
  if (error) throw new LookupError(`Couldn't read that recipe: ${error.message}`);
  return (data as { imported_original?: unknown } | null)?.imported_original ?? null;
}

/** `imported_original` for several recipes, by id. */
export async function getOriginals(ids: string[]): Promise<Map<string, unknown>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await getServiceClient().from("recipes").select("id, imported_original").in("id", ids);
  if (error) throw new LookupError(`Couldn't read the imported recipes: ${error.message}`);
  return new Map((data ?? []).map((r) => [String((r as { id: unknown }).id), (r as { imported_original?: unknown }).imported_original ?? null]));
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
