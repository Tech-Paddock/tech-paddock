import { readMeta, type RecipeMeta } from "./metadata";
import { ConflictError, InputError } from "./errors";

/**
 * Editing a recipe already in the book (2026-09-26): any part of it can change.
 * Since TEC-223 no edit calls a model: **the macros come from a nightly Cowork
 * job** (`NOTES.md`, *The nightly macro job*), so an edit that could change them
 * clears them and the job fills them in again.
 *
 * **Pure: no database, no Next** — the route hands in what it needs as
 * `EditDeps`, so the rules below have tests without either.
 *
 * **What clears the macros, and what does not.** The book stores the whole pot,
 * so the pot's macros depend on the ingredients and the servings:
 *
 * - **Ingredients changed → macros cleared.**
 * - **Servings changed → macros cleared.** The pot is the same, but the job
 *   works from ingredients and servings together, and a recipe that has macros
 *   is one the job never touches. Clearing is what makes it look again.
 * - **Name, method, metadata → macros left alone.** None of them is in the pot.
 *
 * Clearing sets kcal, protein_g, carbs_g, fat_g, source and model to null
 * together, which is the only shape the table's `recipe_macros_together` and
 * `recipe_model_matches_source` checks allow.
 *
 * **What an edit never touches**: grocery lines (text, copied with the recipe's
 * name at the time — TEC-39 B), the menu row (which recipe and when, nothing
 * else), `origin`, `source_url`, and anything Health already logged, which it
 * snapshotted at log time (TEC-21).
 */

export type RecipeEdit = {
  name: string;
  servings: number;
  ingredients: string[];
  method: string | null;
  meta: RecipeMeta;
};

/** The fields of a stored recipe an edit compares against. */
export type EditTarget = Pick<RecipeEdit, "name" | "ingredients" | "servings"> & { id: string };

const MAX_NAME = 200;
const MAX_INGREDIENTS = 80;
const MAX_LINE = 300;
const MAX_METHOD = 20000;

/**
 * An edit off a request body, or the sentence saying why not. Untrusted: every
 * field is re-read, and the metadata through `readMeta`, so an edit cannot store
 * a free-of claim or a macro tag the typed form could not.
 */
export function readEdit(raw: unknown): { edit: RecipeEdit } | { error: string } {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const name = typeof o.name === "string" ? o.name.trim().replace(/\s+/g, " ") : "";
  if (!name) return { error: "The recipe needs a name." };
  if (name.length > MAX_NAME) return { error: "That name is too long." };

  const servings = typeof o.servings === "string" ? Number(o.servings) : o.servings;
  if (typeof servings !== "number" || !Number.isInteger(servings) || servings < 1) {
    return { error: "Servings has to be a whole number, at least one." };
  }

  const ingredients = cleanIngredients(o.ingredients);
  if (ingredients.length === 0) return { error: "List what goes in it." };
  if (ingredients.length > MAX_INGREDIENTS) return { error: "That is a very long ingredient list." };
  if (ingredients.some((i) => i.length > MAX_LINE)) return { error: "One ingredient line is too long." };

  const method = typeof o.method === "string" ? o.method.trim() || null : null;
  if (method && method.length > MAX_METHOD) return { error: "That method is too long." };

  // The rating is read: this is the user's own form.
  return { edit: { name, servings, ingredients, method, meta: readMeta(o.meta, { rating: true }) } };
}

/** Trimmed, blank lines dropped. Accepts a list or the textarea's newline-separated text. */
export function cleanIngredients(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split("\n") : [];
  return raw.map((i) => (typeof i === "string" ? i.trim() : "")).filter(Boolean);
}

/**
 * **Does this edit change the pot?** Only when the ingredient list does — as
 * written, in order, after trimming. Reordering is a change: it is cheap for the
 * nightly job to redo and not worth a rule of its own.
 */
export function changesThePot(current: Pick<RecipeEdit, "ingredients">, edit: Pick<RecipeEdit, "ingredients">): boolean {
  const a = cleanIngredients(current.ingredients);
  const b = cleanIngredients(edit.ingredients);
  return a.length !== b.length || a.some((line, i) => line !== b[i]);
}

/** Does this edit clear the macros? The ingredients or the servings differ (TEC-223). */
export function clearsMacros(
  current: Pick<RecipeEdit, "ingredients" | "servings">,
  edit: Pick<RecipeEdit, "ingredients" | "servings">
): boolean {
  return changesThePot(current, edit) || current.servings !== edit.servings;
}

/** What `applyEdit` needs from the outside world. The route passes the real ones; the tests pass fakes. */
export type EditDeps<R> = {
  getRecipe: (id: string) => Promise<EditTarget | null>;
  /** Is this name held by a recipe other than `exceptId`? */
  nameTakenByOther: (name: string, exceptId: string) => Promise<boolean>;
  /** The one write. `clearMacros` sets kcal, protein_g, carbs_g, fat_g, source and model to null; false leaves them as they are. */
  update: (id: string, edit: RecipeEdit, clearMacros: boolean) => Promise<R>;
  normalizeName: (name: string) => string;
};

/**
 * Apply an edit: check, then write once, clearing the macros if the ingredients
 * or servings changed. Everything that can refuse — the recipe gone, the name
 * taken — happens before `update`, and `update` is one statement, so a refused
 * edit has written nothing. The unique index still catches a name race at the write.
 */
export async function applyEdit<R>(
  deps: EditDeps<R>,
  id: string,
  edit: RecipeEdit
): Promise<{ recipe: R; macrosCleared: boolean }> {
  const current = await deps.getRecipe(id);
  if (!current) throw new InputError("That recipe is not in the book any more.");

  if (deps.normalizeName(edit.name) !== deps.normalizeName(current.name) && (await deps.nameTakenByOther(edit.name, id))) {
    throw new ConflictError(`"${edit.name}" is already in the book. Pick another name.`);
  }

  const clear = clearsMacros(current, edit);
  return { recipe: await deps.update(id, edit, clear), macrosCleared: clear };
}
