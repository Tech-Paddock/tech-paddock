import { getServiceClient } from "./supabase";
import { LookupError, upsertItem, addVersion, findItem } from "./items";
import { ZERO, round, type Macros, type MacroSource } from "./macros";
import { addItems } from "./grocery";

/**
 * The recipe book, and the one link that makes logging a recipe free.
 *
 * **A recipe owns exactly one `health.items` row**, created with it and named
 * after it, whose single version holds the macros of ONE SERVING. Nothing in
 * `lib/log.ts` knows recipes exist: dictating "two servings of my chilli"
 * resolves at tier 1 of the lookup order — your own table, no model call —
 * with `quantity` as the number of servings. Joel: *"macro tracker should only
 * be reading from database."*
 *
 * The book stores the **whole pot**; the item stores a serving. Dividing is
 * the cheap direction, and it keeps "I got eight bowls, not six" a lossless
 * edit. See the migration header for the rest of the reasoning.
 */

export type RecipeOrigin = "manual" | "generated" | "imported";

export type Recipe = Macros & {
  id: string;
  item_id: string;
  name: string;
  servings: number;
  origin: RecipeOrigin;
  source: MacroSource;
  model: string | null;
  source_url: string | null;
  ingredients: string[];
  method: string | null;
  note: string | null;
  created_at: string;
};

/**
 * What a recipe looks like before it is a recipe.
 *
 * Guardrail 1, in the same shape the meal log uses it: whichever way a draft
 * arrived — typed, generated, or read off a page — it is not in the book until
 * you approve it, and approving is the only thing that writes.
 */
export type RecipeDraft = {
  name: string;
  servings: number;
  macros: Macros;
  origin: RecipeOrigin;
  source: MacroSource;
  model: string | null;
  source_url: string | null;
  ingredients: string[];
  method: string | null;
  note: string | null;
};

const COLUMNS =
  "id, item_id, name, servings, kcal, protein_g, carbs_g, fat_g, origin, source, model, source_url, ingredients, method, note, created_at";

/** One serving: the pot divided by how many it feeds. */
export function perServing(recipe: Pick<Recipe, "servings"> & Macros): Macros {
  const n = recipe.servings > 0 ? recipe.servings : 1;
  return {
    kcal: recipe.kcal / n,
    protein_g: recipe.protein_g / n,
    carbs_g: recipe.carbs_g / n,
    fat_g: recipe.fat_g / n,
  };
}

/** The pot, from a per-serving figure. The direction a hand correction takes. */
export function wholeRecipe(perServingMacros: Macros, servings: number): Macros {
  const n = servings > 0 ? servings : 1;
  return {
    kcal: perServingMacros.kcal * n,
    protein_g: perServingMacros.protein_g * n,
    carbs_g: perServingMacros.carbs_g * n,
    fat_g: perServingMacros.fat_g * n,
  };
}

function hydrate(row: Record<string, unknown>): Recipe {
  return {
    ...(row as unknown as Recipe),
    servings: Number(row.servings),
    kcal: Number(row.kcal),
    protein_g: Number(row.protein_g),
    carbs_g: Number(row.carbs_g),
    fat_g: Number(row.fat_g),
    ingredients: Array.isArray(row.ingredients) ? (row.ingredients as string[]) : [],
  };
}

// ---------------------------------------------------------------------------
// Reads. Same LookupError discipline as everything else here: a failed query
// never renders as an empty book.
// ---------------------------------------------------------------------------

export async function listRecipes(): Promise<Recipe[]> {
  const { data, error } = await getServiceClient()
    .from("recipes")
    .select(COLUMNS)
    .order("created_at", { ascending: false });

  if (error) throw new LookupError(`Couldn't read the recipe book: ${error.message}`);
  return (data ?? []).map((r) => hydrate(r as Record<string, unknown>));
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  const { data, error } = await getServiceClient()
    .from("recipes")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new LookupError(`Couldn't read that recipe: ${error.message}`);
  return data ? hydrate(data as Record<string, unknown>) : null;
}

// ---------------------------------------------------------------------------
// The write path. Approving a draft is the only thing that reaches it.
// ---------------------------------------------------------------------------

/**
 * Why a draft is refused rather than fixed up.
 *
 * A recipe writes an item the whole log will trust afterwards, so a zero or a
 * missing name must not become a row that later reads as a real food with real
 * numbers. Returns a message, or null when the draft is sound.
 */
export function validateDraft(draft: RecipeDraft): string | null {
  if (!draft.name.trim()) return "The recipe needs a name.";
  if (!Number.isInteger(draft.servings) || draft.servings < 1) {
    return "Servings has to be a whole number, at least one.";
  }
  if (draft.macros.kcal <= 0) return "A recipe with no calories is a recipe nobody estimated.";
  for (const [key, value] of Object.entries(draft.macros)) {
    if (!Number.isFinite(value) || value < 0) return `${key} is not a number a recipe can have.`;
  }
  if (draft.source !== "hand" && !draft.model) {
    return "A number a model produced has to say which model.";
  }
  return null;
}

/**
 * Write an approved draft: the food first, then the book entry.
 *
 * **The item comes first on purpose.** If the recipe row failed after the item
 * existed, you would have a loggable food with no recipe behind it — untidy,
 * but every number in it is still true. The other order gives a recipe row
 * pointing at nothing, which `readDay` would resolve to zero macros and show as
 * a meal that cost nothing. One of those is a tidy-up; the other is a wrong
 * total, and this app's whole claim is that totals are not wrong.
 */
export async function saveRecipe(draft: RecipeDraft, onDate: string): Promise<Recipe> {
  const problem = validateDraft(draft);
  if (problem) throw new LookupError(problem);

  const name = draft.name.trim();

  // A recipe named after a food you already log would quietly take that item
  // over and rewrite what "chilli" means in every past entry. Refuse instead.
  const clash = await findItem(name);
  if (clash) {
    const { data, error } = await getServiceClient()
      .from("recipes")
      .select("id")
      .eq("item_id", clash.item.id)
      .maybeSingle();
    if (error) throw new LookupError(`Couldn't check that name: ${error.message}`);
    throw new LookupError(
      data
        ? `"${name}" is already in the book.`
        : `"${name}" is already a food in your log. Give the recipe a name of its own.`
    );
  }

  const item = await upsertItem(name);

  await addVersion({
    itemId: item.id,
    macros: perServing({ ...draft.macros, servings: draft.servings }),
    kind: "correction",
    effectiveFrom: onDate,
    source: draft.source,
    model: draft.model,
    sourceUrl: draft.source_url,
    note: `One serving of ${name}, from a recipe of ${draft.servings}.`,
  });

  const { data, error } = await getServiceClient()
    .from("recipes")
    .insert({
      item_id: item.id,
      name,
      servings: draft.servings,
      kcal: draft.macros.kcal,
      protein_g: draft.macros.protein_g,
      carbs_g: draft.macros.carbs_g,
      fat_g: draft.macros.fat_g,
      origin: draft.origin,
      source: draft.source,
      model: draft.source === "hand" ? null : draft.model,
      source_url: draft.source_url,
      ingredients: draft.ingredients.map((i) => i.trim()).filter(Boolean),
      method: draft.method?.trim() || null,
      note: draft.note?.trim() || null,
    })
    .select(COLUMNS)
    .single();

  if (error) throw new LookupError(`Couldn't save that recipe: ${error.message}`);
  return hydrate(data as Record<string, unknown>);
}

/**
 * Remove a recipe from the book.
 *
 * **The food stays.** Deleting a recipe deletes the way you cook it, not the
 * days you ate it — the cascade runs the other way, from `items` to `recipes`,
 * so dropping the recipe row leaves the item and every version and entry that
 * reference it intact. That is the same commitment Joel approved for deleting
 * a meal: *deleting an entry must not delete the food*.
 */
export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await getServiceClient().from("recipes").delete().eq("id", id);
  if (error) throw new LookupError(`Couldn't remove that recipe: ${error.message}`);
}

/** Push a recipe's ingredients onto the grocery list, tagged as coming from one. */
export async function toGroceryList(recipe: Recipe): Promise<number> {
  const lines = recipe.ingredients.map((i) => i.trim()).filter(Boolean);
  if (lines.length === 0) throw new LookupError("That recipe has no ingredients listed.");

  // `source: "recipe"` has been in the grocery enum since 20260919220112 and
  // has never had a writer. This is it.
  const added = await addItems(lines.map((name) => ({ name, source: "recipe" as const })));
  return added.length;
}

/** What the screen shows per serving, rounded only for display. */
export function servingLabel(recipe: Recipe): Macros {
  return round(perServing(recipe));
}

export { ZERO };
