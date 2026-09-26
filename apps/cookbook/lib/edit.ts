import { readMeta, type RecipeMeta } from "./metadata";
import type { Macros } from "./macros";
import type { ModelId } from "./models";
import { ConflictError, InputError } from "./errors";

/**
 * Editing a recipe already in the book (Joel, 2026-09-26: *"I should be able to
 * edit any part of the recipe. Editing the recipe should update macros."*).
 *
 * **Pure: no database, no model, no Next** — the route hands in what it needs as
 * `EditDeps`, so the rules below have tests without either. That matters most
 * for the one rule that has to hold absolutely: **a failed re-price writes
 * nothing.** The estimate runs before the single write, and the write is never
 * reached if it throws.
 *
 * **What re-prices, and what does not.** The book stores the whole pot and
 * divides on the way out (`RULES.md`), so the pot's macros depend on the
 * ingredients and nothing else in an edit:
 *
 * - **Ingredients changed → one pricing call**, through `estimateRecipeMacros`,
 *   the same path every way in uses. The new pot, its model and its caveat
 *   replace the old ones.
 * - **Servings changed alone → no call.** Same pot, a different divisor: "I got
 *   eight bowls, not six" is the charter's own example of the cheap edit, and
 *   `/api/servings` divides the stored pot by the new count on the next read.
 *   Asking a model to re-estimate an unchanged list would buy a noisier number
 *   of the same pot.
 * - **Name, method, metadata → no call.** None of them is in the pot.
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
export type EditTarget = Pick<RecipeEdit, "name" | "ingredients"> & { id: string };

/** A re-price's result, as it lands on the row. */
export type Reprice = { macros: Macros; model: ModelId; note: string | null };

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
  if (ingredients.length === 0) return { error: "List what goes in it — the macros come from that." };
  if (ingredients.length > MAX_INGREDIENTS) return { error: "That is a very long ingredient list." };
  if (ingredients.some((i) => i.length > MAX_LINE)) return { error: "One ingredient line is too long." };

  const method = typeof o.method === "string" ? o.method.trim() || null : null;
  if (method && method.length > MAX_METHOD) return { error: "That method is too long." };

  // The rating is read: this is Joel's own form.
  return { edit: { name, servings, ingredients, method, meta: readMeta(o.meta, { rating: true }) } };
}

/** Trimmed, blank lines dropped. Accepts a list or the textarea's newline-separated text. */
export function cleanIngredients(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split("\n") : [];
  return raw.map((i) => (typeof i === "string" ? i.trim() : "")).filter(Boolean);
}

/**
 * **Does this edit change the pot?** Only when the ingredient list does — as
 * written, in order, after trimming. Reordering is a change: it is cheap to
 * re-price and not worth a rule of its own. Servings is deliberately not here.
 */
export function changesThePot(current: Pick<RecipeEdit, "ingredients">, edit: Pick<RecipeEdit, "ingredients">): boolean {
  const a = cleanIngredients(current.ingredients);
  const b = cleanIngredients(edit.ingredients);
  return a.length !== b.length || a.some((line, i) => line !== b[i]);
}

/** What `applyEdit` needs from the outside world. The route passes the real ones; the tests pass fakes. */
export type EditDeps<R> = {
  getRecipe: (id: string) => Promise<EditTarget | null>;
  /** Is this name held by a recipe other than `exceptId`? */
  nameTakenByOther: (name: string, exceptId: string) => Promise<boolean>;
  estimate: (recipe: RecipeEdit) => Promise<{ macros: Macros; note: string | null }>;
  /** The one write. `reprice` null leaves the macros, source, model and note as they are. */
  update: (id: string, edit: RecipeEdit, reprice: Reprice | null) => Promise<R>;
  normalizeName: (name: string) => string;
};

/**
 * Apply an edit: check, price if the pot changed, then write once.
 *
 * **Order is the guarantee.** Everything that can refuse — the recipe gone, the
 * name taken, the model failing — happens before `update`, and `update` is one
 * statement. So a refused edit has written nothing, and the recipe on screen is
 * still the recipe in the book. The name is checked before the call so a
 * collision does not pay for a pricing it could never keep; the unique index
 * still catches a race at the write.
 */
export async function applyEdit<R>(
  deps: EditDeps<R>,
  id: string,
  edit: RecipeEdit,
  model: ModelId
): Promise<{ recipe: R; repriced: boolean }> {
  const current = await deps.getRecipe(id);
  if (!current) throw new InputError("That recipe is not in the book any more.");

  if (deps.normalizeName(edit.name) !== deps.normalizeName(current.name) && (await deps.nameTakenByOther(edit.name, id))) {
    throw new ConflictError(`"${edit.name}" is already in the book. Pick another name.`);
  }

  let reprice: Reprice | null = null;
  if (changesThePot(current, edit)) {
    // Throws on any failure, and nothing below runs.
    const estimate = await deps.estimate(edit);
    reprice = { macros: estimate.macros, model, note: estimate.note };
  }

  return { recipe: await deps.update(id, edit, reprice), repriced: reprice !== null };
}
