import { yieldCount } from "./houseStyle";
import { applyEdit, type RecipeEdit, type Reprice } from "./edit";
import { InputError, statusOf } from "./errors";
import { readMeta } from "./metadata";
import type { Macros } from "./macros";
import type { Recipe } from "./recipes";
import type { StyledRecipe } from "./anthropic";

/**
 * Tidy (TEC-201): put a recipe in the house style (`lib/houseStyle.ts`), one
 * recipe at a time, as a **draft** that a person keeps from the review screen.
 *
 * **Pure: no database, no model, no Next.** The routes hand in what they need as
 * deps, so the rules below have tests without either, in the way `lib/edit.ts`
 * does. The rules that have to hold:
 *
 * - **A draft never changes a recipe.** `makeDraft` has no way to write a recipe:
 *   its deps are a read, a model call and a draft store, and the name is not in a
 *   draft at all.
 * - **Keeping a draft prices it at once**, through the ingredient-edit path
 *   (`applyEdit`, which writes the whole pot, `source = estimate`, the model
 *   named). If the model fails, the recipe is **still kept**, with its macros
 *   back to "not estimated yet"; a retry is `POST /api/recipes/estimate`.
 * - **Revert restores the import**: its ingredients, method and servings, with
 *   the macros back to not estimated. It only ever reads `imported_original`
 *   (a trigger refuses to change it once set).
 */

/** What Tidy proposes for one recipe. The recipe's name is never here. */
export type TidyDraft = {
  recipe_id: string;
  ingredients: string[];
  method: string | null;
  servings: number;
  /** True only where the imported yield gave no count and the servings are the model's guess. */
  servings_estimated: boolean;
};

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

/** What Tidy reads, and whether its servings need estimating. */
export type Source = {
  ingredients: string[];
  method: string | null;
  servings: number;
  yieldText: string | null;
  /** Read from `imported_original` rather than the current row. */
  fromOriginal: boolean;
  /** The imported yield gave no count: Tidy estimates servings, and the screen marks it. */
  estimateServings: boolean;
};

/**
 * **Tidy reads `imported_original` when it is set, otherwise the current row.**
 * Servings are estimated only for a recipe that was imported and whose yield text
 * is blank or not a number; a recipe someone set the servings on is never
 * re-guessed.
 */
export function tidySource(recipe: Pick<Recipe, "servings" | "ingredients" | "method">, original: unknown): Source {
  const imported = readOriginal(original);
  if (imported) {
    return {
      ingredients: imported.ingredients,
      method: imported.method,
      servings: recipe.servings,
      yieldText: imported.yieldText,
      fromOriginal: true,
      estimateServings: yieldCount(imported.yieldText) === null,
    };
  }
  return {
    ingredients: recipe.ingredients,
    method: recipe.method,
    servings: recipe.servings,
    yieldText: null,
    fromOriginal: false,
    estimateServings: false,
  };
}

const validServings = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 99;

// ---------------------------------------------------------------------------
// Making a draft
// ---------------------------------------------------------------------------

export type DraftDeps = {
  getRecipe: (id: string) => Promise<Pick<Recipe, "id" | "name" | "servings" | "ingredients" | "method"> | null>;
  getOriginal: (id: string) => Promise<unknown>;
  style: (params: {
    name: string;
    servings: number;
    ingredients: string[];
    method: string | null;
    estimateServings: boolean;
  }) => Promise<StyledRecipe>;
  /** Replaces any earlier draft for the recipe. The only write there is. */
  saveDraft: (draft: TidyDraft) => Promise<void>;
};

/**
 * One model call, one draft. **Writes the draft and nothing else**: a failed
 * restyle throws before `saveDraft`, and no path here reaches a recipe row.
 */
export async function makeDraft(deps: DraftDeps, id: string): Promise<TidyDraft> {
  const recipe = await deps.getRecipe(id);
  if (!recipe) throw new InputError("That recipe is not in the book any more.");

  const source = tidySource(recipe, await deps.getOriginal(id));
  if (source.ingredients.length === 0) throw new InputError(`"${recipe.name}" has no ingredients to tidy.`);

  const styled = await deps.style({
    name: recipe.name,
    servings: source.servings,
    ingredients: source.ingredients,
    method: source.method,
    estimateServings: source.estimateServings,
  });

  const draft: TidyDraft = {
    recipe_id: id,
    ingredients: styled.ingredients,
    method: styled.method,
    servings: source.estimateServings && validServings(styled.servings) ? styled.servings : source.servings,
    servings_estimated: source.estimateServings,
  };
  await deps.saveDraft(draft);
  return draft;
}

/** A draft as the review screen draws it: what Tidy read beside what it proposes. */
export type TidyDraftView = {
  id: string;
  name: string;
  before: { ingredients: string[]; method: string | null; servings: number; yield_text: string | null };
  after: { ingredients: string[]; method: string | null; servings: number };
  servings_estimated: boolean;
};

export function draftView(
  draft: TidyDraft,
  recipe: Pick<Recipe, "name" | "servings" | "ingredients" | "method">,
  original: unknown
): TidyDraftView {
  const source = tidySource(recipe, original);
  return {
    id: draft.recipe_id,
    name: recipe.name,
    before: { ingredients: source.ingredients, method: source.method, servings: recipe.servings, yield_text: source.yieldText },
    after: { ingredients: draft.ingredients, method: draft.method, servings: draft.servings },
    servings_estimated: draft.servings_estimated,
  };
}

// ---------------------------------------------------------------------------
// Keeping a draft
// ---------------------------------------------------------------------------

type Update<R> = (id: string, edit: RecipeEdit, reprice: Reprice | null, opts: { styled?: boolean; clearMacros?: boolean }) => Promise<R>;

export type KeepDeps<R> = {
  getRecipe: (id: string) => Promise<Recipe | null>;
  getDraft: (id: string) => Promise<TidyDraft | null>;
  deleteDraft: (id: string) => Promise<void>;
  nameTakenByOther: (name: string, exceptId: string) => Promise<boolean>;
  normalizeName: (name: string) => string;
  estimate: (recipe: RecipeEdit) => Promise<{ macros: Macros; note: string | null }>;
  update: Update<R>;
};

/** The pricing call failed: the one error `keepDraft` turns into "kept, not estimated". */
class EstimateFailed extends Error {}

/**
 * Keep one draft: write the tidy, price it, delete the draft.
 *
 * **Priced through `applyEdit`**, the ingredient-edit path, with `always` so a
 * recipe that had no macros is priced too. **A failed estimate does not undo the
 * keep**: the recipe is written with its macros back to not estimated (so the old
 * numbers never sit beside ingredients they were not worked out from) and the
 * result says `estimated: false`. The name is the recipe's own; a draft cannot
 * carry one. `servings` is honoured only for a draft whose servings were a guess.
 */
export async function keepDraft<R>(
  deps: KeepDeps<R>,
  id: string,
  opts: { servings?: unknown } = {}
): Promise<{ recipe: R; estimated: boolean }> {
  const current = await deps.getRecipe(id);
  if (!current) throw new InputError("That recipe is not in the book any more.");
  const draft = await deps.getDraft(id);
  if (!draft) throw new InputError(`There is no tidy waiting for "${current.name}".`);

  const servings = draft.servings_estimated && validServings(opts.servings) ? opts.servings : draft.servings;
  const edit: RecipeEdit = {
    name: current.name,
    servings,
    ingredients: draft.ingredients,
    method: draft.method,
    meta: readMeta(current, { rating: true }),
  };

  let result: { recipe: R; repriced: boolean };
  try {
    result = await applyEdit<R>(
      {
        getRecipe: async () => current,
        nameTakenByOther: deps.nameTakenByOther,
        normalizeName: deps.normalizeName,
        estimate: async (r) => {
          try {
            return await deps.estimate(r);
          } catch (e) {
            if (statusOf(e) !== 500) throw e;
            throw new EstimateFailed(e instanceof Error ? e.message : "The estimate failed.");
          }
        },
        update: (rid, e, reprice) => deps.update(rid, e, reprice, { styled: true }),
      },
      id,
      edit,
      { always: true }
    );
  } catch (e) {
    if (!(e instanceof EstimateFailed)) throw e;
    // Nothing was written yet (the estimate runs before the one write). Keep the tidy without macros.
    const recipe = await deps.update(id, edit, null, { styled: true, clearMacros: true });
    await deps.deleteDraft(id);
    return { recipe, estimated: false };
  }

  await deps.deleteDraft(id);
  return { recipe: result.recipe, estimated: true };
}

// ---------------------------------------------------------------------------
// Reverting
// ---------------------------------------------------------------------------

/** The fields Revert puts back. The macros and the mark go with them in the write. */
export type RevertFields = { ingredients: string[]; method: string | null; servings: number };

export type RevertDeps<R> = {
  getRecipe: (id: string) => Promise<Pick<Recipe, "id" | "servings"> | null>;
  getOriginal: (id: string) => Promise<unknown>;
  /** One write: these fields, macros/source/model/note null, `house_style_at` null. */
  write: (id: string, fields: RevertFields) => Promise<R>;
  deleteDraft: (id: string) => Promise<void>;
};

/**
 * Put the imported recipe back. **It only reads `imported_original`.** Servings
 * are the import's own where it holds one, else the yield text's count, else
 * whatever the recipe has now (an estimate that was kept stays until someone
 * changes it).
 */
export async function revertToImported<R>(deps: RevertDeps<R>, id: string): Promise<R> {
  const recipe = await deps.getRecipe(id);
  if (!recipe) throw new InputError("That recipe is not in the book any more.");
  const original = readOriginal(await deps.getOriginal(id));
  if (!original) throw new InputError("That recipe has no imported version to go back to.");

  const written = await deps.write(id, {
    ingredients: original.ingredients,
    method: original.method,
    servings: original.servings ?? yieldCount(original.yieldText) ?? recipe.servings,
  });
  await deps.deleteDraft(id);
  return written;
}
