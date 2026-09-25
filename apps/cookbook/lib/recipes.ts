import { getServiceClient } from "./supabase";
import { ConflictError, InputError, LookupError } from "./errors";
import { round, type Macros, type MacroSource } from "./macros";
import { addItems } from "./grocery";

/**
 * The book: what a recipe is, and the one path that writes one.
 *
 * **The book stores the whole pot and derives the serving.** Dividing is the
 * lossless direction, so "I got eight bowls, not six" is a one-field edit rather
 * than a re-estimate. `perServing` is the only divider in the app and
 * `tests/recipes.test.ts` asserts it round-trips against `wholeRecipe`, because
 * the two disagreeing would be every number on the screen being quietly wrong.
 *
 * **What is deliberately not here: any link to another app's data.** In Health
 * a recipe owned a `health.items` row, which made logging a serving free. A
 * separate app cannot write that table. The replacement is the contract in
 * `RULES.md` (TEC-11): Health's server calls `GET /api/servings`, and
 * `toServingRows` below is Cookbook's side of it. So this file reads and writes
 * `cookbook` and nothing else, and nothing here writes another app's log.
 */

export type RecipeOrigin = "manual" | "generated" | "imported";

export type Recipe = Macros & {
  id: string;
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
 * **One approval covers all three ways in.** Typed, generated or read off a
 * page, what comes back is a draft on the screen; keeping it is the only thing
 * that writes. The draft is not the book.
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
  "id, name, servings, kcal, protein_g, carbs_g, fat_g, origin, source, model, source_url, ingredients, method, note, created_at";

/**
 * How two names are compared for collision.
 *
 * **Must stay identical to `recipes_name_key`** in
 * `20260920031200_cookbook_tables.sql`, which indexes
 * `lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))`. This copy exists so the
 * screen and the tests can reason about a collision without a round trip; the
 * database is what actually enforces it.
 */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** One serving: the pot divided by how many it feeds. */
export function perServing(recipe: Pick<Recipe, "servings"> & Macros): Macros {
  // Guarding the divisor rather than trusting it. `validateDraft` refuses a
  // nonsense serving count before it can be stored, but a draft is rendered the
  // moment it comes back from a model — and Infinity on a screen is worse than a
  // wrong number, because it is not even readable as wrong.
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

/** What the screen shows per serving, rounded only for display. */
export function servingLabel(recipe: Recipe): Macros {
  return round(perServing(recipe));
}

/**
 * One recipe as Health reads it: `GET /api/servings`, the contract in `RULES.md`
 * (TEC-11, TEC-24). **The contract's one home is the charter**; this is its shape
 * in code, and `tests/servings.test.ts` holds it.
 */
export type ServingRow = {
  id: string;
  name: string;
  servings: number;
  per_serving: Macros;
};

/**
 * The book, per serving. **Cookbook does the division** — the table stores the
 * whole pot, and Health never learns that convention. Through `perServing`, the
 * app's only divider, so the screen and the contract cannot disagree.
 *
 * **Not rounded.** Health snapshots these numbers at log time and multiplies them
 * by however many servings were eaten; rounding here would round before the
 * multiply. Display rounding is the reader's.
 *
 * **Additive only.** A new field is free; renaming or removing one is a contract
 * change and the technical director's.
 */
export function toServingRows(recipes: Recipe[]): ServingRow[] {
  return recipes.map((r) => ({
    id: r.id,
    name: r.name,
    servings: r.servings,
    per_serving: perServing(r),
  }));
}

/**
 * Numeric columns come back as strings from PostgREST, and `text[]` can come
 * back null on an older row. Both would render as `NaN` and a crash rather than
 * as a number and an empty list.
 */
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
// Reads. A failed query throws; it never returns an empty book.
// ---------------------------------------------------------------------------

export async function listRecipes(): Promise<Recipe[]> {
  const { data, error } = await getServiceClient()
    .from("recipes")
    .select(COLUMNS)
    .order("created_at", { ascending: false });

  if (error) throw new LookupError(`Couldn't read the book: ${error.message}`);
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

/**
 * Is this name already in the book? **A courtesy, not the rule** — the unique
 * index is the rule, and `saveRecipe` still catches the collision from the
 * insert. This exists so a typed recipe is refused before it pays for a pricing
 * call it can never keep (TEC-29 item 8). Compared through `normalizeName`, the
 * index's own expression.
 */
export async function nameTaken(name: string): Promise<boolean> {
  const { data, error } = await getServiceClient().from("recipes").select("name");
  if (error) throw new LookupError(`Couldn't read the book: ${error.message}`);
  const wanted = normalizeName(name);
  return (data ?? []).some((r) => normalizeName(String((r as { name: unknown }).name)) === wanted);
}

// ---------------------------------------------------------------------------
// The write path. Keeping a draft is the only thing that reaches it.
// ---------------------------------------------------------------------------

/**
 * Why a draft is refused rather than tidied up.
 *
 * A recipe is a number you will trust for as long as it is in the book, and
 * re-costing one is a deliberate act. A zero, a fraction of a serving or a
 * missing model must not become a row that later reads like something somebody
 * checked. Returns a message, or null when the draft is sound.
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

/** Postgres unique-violation. A name already in the book, not a broken write. */
const UNIQUE_VIOLATION = "23505";

/**
 * Write an approved draft into the book.
 *
 * **The name collision is caught from the insert rather than checked first.** In
 * Health it had to be a lookup, because uniqueness lived in the `items` table a
 * recipe pointed at. Here the unique index is on this very row, so the insert
 * *is* the check — which is also the only version of it that cannot lose a race
 * with itself. A pre-check would be two round trips and a window between them.
 */
export async function saveRecipe(draft: RecipeDraft): Promise<Recipe> {
  const problem = validateDraft(draft);
  if (problem) throw new InputError(problem);

  const name = draft.name.trim();

  const { data, error } = await getServiceClient()
    .from("recipes")
    .insert({
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

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new ConflictError(
        `"${name}" is already in the book. Rename it, or remove the one that is in there.`
      );
    }
    throw new LookupError(`Couldn't save that recipe: ${error.message}`);
  }
  return hydrate(data as Record<string, unknown>);
}

/**
 * Take a recipe out of the book.
 *
 * **Only its menu entry goes with it**, by the foreign key's cascade — a menu
 * entry for a recipe that no longer exists has nothing to show. Lines already on
 * the shopping list stay — they were copied as text when you added them, names
 * included, not linked — so removing a recipe in the shop does not empty your
 * list. Anything logged elsewhere is untouched by construction: this app has
 * never written to another schema.
 */
export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await getServiceClient().from("recipes").delete().eq("id", id);
  if (error) throw new LookupError(`Couldn't remove that recipe: ${error.message}`);
}

/**
 * Push a recipe's ingredients onto the shopping list, tagged as coming from one.
 *
 * **Additive and dumb on purpose.** The lines go on as written; nothing merges
 * them with what is already there. Tidy is a deliberate tap on the list, never
 * something that happens to your list because you added a recipe to it.
 */
export async function toGroceryList(recipe: Recipe): Promise<number> {
  const lines = recipe.ingredients.map((i) => i.trim()).filter(Boolean);
  if (lines.length === 0) throw new InputError("That recipe has no ingredients listed.");

  // Each line names the recipe it came from, as the recipe is called now: a
  // snapshot, so renaming the recipe later leaves the line alone (TEC-39 B).
  const added = await addItems(lines.map((name) => ({ name, source: "recipe" as const, recipes: [recipe.name] })));
  return added.length;
}

/**
 * A method as the lines you actually follow at the worktop.
 *
 * **The renderer already honoured newlines; the model was the one running the
 * steps together.** Fixing the prompt alone would have looked like a fix and
 * left every recipe already in the book as one wall of text, so the split
 * happens here, on the way to the screen, where it repairs the old rows too.
 *
 * **Split on step markers, never on sentences.** "Add the stock. Simmer." is one
 * instruction in two sentences as often as it is two steps, and there is no way
 * to tell from the text. A numbered marker is the author saying where the breaks
 * are, so it is the only thing trusted.
 *
 * **A number is a marker only when nothing but a marker could be there**: at a
 * line start or after a space, followed by `.` or `)`, then a space, then a
 * letter. That is what keeps `1.5 tbsp oil` and `Bake at 180. 20 minutes.` out —
 * both look like markers until the character after the dot is read.
 */
export function methodSteps(method: string | null): string[] {
  if (!method) return [];

  const marker = /(?:^|\s)\d{1,2}[.)]\s+(?=[A-Za-z])/g;
  const text = method.trim();
  if (!text) return [];

  // Existing newlines are the author's own breaks and are always kept. Splitting
  // a line that is already one step is how a tidy list becomes a ragged one.
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // **A marker splits only when it is the next number in the run** (TEC-29 item
  // 4). "Heat the oven to gas mark 4. Bake until golden." has a marker by shape
  // and a setting by meaning; what tells them apart is that no step 3 came before
  // it. The run carries across lines, so "1. Chop.\n2. Fry. 3. Serve." still
  // splits at 3. A run starts only at 1 — at a line start, or mid-line when a 2
  // follows it.
  let last = 0;

  const out: string[] = [];
  for (const line of lines) {
    const found = [...line.matchAll(marker)].map((m) => ({
      // The marker may have consumed a leading space; the step starts at the digit.
      at: m.index + (m[0].length - m[0].trimStart().length),
      n: Number.parseInt(m[0].trim(), 10),
    }));

    const cuts: number[] = [];
    found.forEach(({ at, n }, i) => {
      if (at === 0) {
        // The author's own line break already made this a step; it only sets
        // where the run has got to.
        last = n;
        return;
      }
      // Mid-line, a 1 is a step only when a 2 follows it: "Serves 1. Enjoy."
      // ends in a number and starts no run.
      const next = n === 1 ? found[i + 1]?.n === 2 : n === last + 1;
      if (next) {
        cuts.push(at);
        last = n;
      }
    });
    if (cuts.length === 0) {
      out.push(line);
      continue;
    }
    let from = 0;
    for (const at of cuts) {
      const piece = line.slice(from, at).trim();
      if (piece) out.push(piece);
      from = at;
    }
    const tail = line.slice(from).trim();
    if (tail) out.push(tail);
  }

  return out;
}
