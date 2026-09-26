/**
 * Recipe metadata (TEC-52): time, meal, main, cuisine, equipment, diet, tags,
 * rating. What you decide what to cook by, as opposed to what it costs you.
 *
 * **Pure, and imported by the browser** — so it must never import `supabase.ts`
 * (the trap in `HANDOFF.md`). The migration header,
 * `cookbook_recipe_metadata`, holds the reasoning; this file holds the rules the
 * database cannot express.
 *
 * Two things were agreed not to exist, and this is where they are refused:
 *
 * - **No allergen or gluten-free claim.** A wrong macro is a wrong number; a
 *   wrong allergen claim is not. `diet` is a closed list of what a dish *is*, and
 *   any tag, main or diet word saying what it is *free of* is dropped.
 * - **No macro-derived tag.** "High protein" is computed from the numbers when it
 *   is wanted, never stored — a stored one goes stale the moment the recipe is
 *   re-estimated.
 *
 * **Everything here reads untrusted input and returns something storable**: a
 * model's answer and a request body go through the same reader, so the two
 * cannot disagree about what a field may hold.
 */

/** Must match the check constraint on `cookbook.recipes.meal`. */
export const MEALS = ["breakfast", "lunch", "dinner", "snack", "dessert", "side"] as const;
export type Meal = (typeof MEALS)[number];

/** Must match the check constraint on `cookbook.recipes.diet`. What a dish IS, never what it is free of. */
export const DIETS = ["vegetarian", "vegan", "pescatarian"] as const;
export type Diet = (typeof DIETS)[number];

export type RecipeMeta = {
  total_minutes: number | null;
  meal: Meal | null;
  mains: string[];
  cuisine: string | null;
  equipment: string[];
  diet: Diet[];
  tags: string[];
  /** 1–5, Joel's. No model path carries one. */
  rating: number | null;
};

export const EMPTY_META: RecipeMeta = {
  total_minutes: null,
  meal: null,
  mains: [],
  cuisine: null,
  equipment: [],
  diet: [],
  tags: [],
  rating: null,
};

/** Two days. Matches the column's check; past it the number is a typo, not a recipe. */
export const MAX_MINUTES = 2880;
const MAX_LIST = 8;
const MAX_WORD = 40;

/**
 * A claim about what a dish is free of — the allergen flag that was agreed not to
 * exist. "gluten-free", "dairy free", "nut-free", "free from eggs", "allergen".
 * Deliberately broad: a word wrongly dropped costs a tag, a claim wrongly kept
 * could cost someone who trusted it. **"Free-range" is the one exception** — it
 * says how the hen lived, not what the dish lacks, and "free-range eggs" is a
 * real main.
 */
const FREE_OF = /\bfree\b(?![- ]range)|allergen|allergy|\bceliac\b|\bcoeliac\b/i;

/**
 * A fact about the macros written down as a tag. Computed, never tagged.
 * "high protein", "low-carb", "keto", "low calorie", "lean".
 */
const MACRO_WORD =
  /\b(high|low|lower|higher|reduced)[- ]?(protein|carbs?|fat|cal|calories?|kcal|sugar|sodium|salt|fibre|fiber)\b|\bketo(genic)?\b|\blow[- ]?cal\b|\bmacros?\b|\blight\b|\blean\b|\b\d+\s*(g|kcal|cal)\b/i;

/** Would this word be refused as a tag, a main or an equipment line? Exported for the tests. */
export function refusedWord(word: string): "free-of" | "macro" | null {
  if (FREE_OF.test(word)) return "free-of";
  if (MACRO_WORD.test(word)) return "macro";
  return null;
}

function cleanWord(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const w = value.trim().replace(/\s+/g, " ").toLowerCase();
  if (!w || w.length > MAX_WORD) return null;
  return w;
}

/**
 * A list field from anything: an array, or a comma-separated string off a form.
 * Lowercased, deduplicated, capped, and anything refused dropped.
 *
 * **A free-of claim is refused in every list; a macro word only among tags.**
 * "Lean beef" is a real main — it names what you buy — whereas "lean" as a tag is
 * a claim about the numbers.
 */
export function readList(value: unknown, opts: { tags?: boolean } = {}): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const out: string[] = [];
  for (const item of raw) {
    const w = cleanWord(item);
    if (!w || out.includes(w)) continue;
    const refused = refusedWord(w);
    if (refused === "free-of" || (refused === "macro" && opts.tags)) continue;
    out.push(w);
    if (out.length === MAX_LIST) break;
  }
  return out;
}

export function readMinutes(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const m = Math.round(n);
  return m >= 1 && m <= MAX_MINUTES ? m : null;
}

export function readRating(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

/**
 * Metadata off untrusted input.
 *
 * **`rating` is read only when the caller says a person set it** — a request
 * body from this app's own form. A model's answer is read with `rating: false`,
 * so a model that volunteers a rating has it thrown away rather than stored.
 *
 * A diet word found among the tags is moved to `diet`, where a filter will look
 * for it, rather than kept as a tag that means the same thing.
 */
export function readMeta(raw: unknown, opts: { rating: boolean }): RecipeMeta {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const meal = cleanWord(o.meal);
  const cuisine = cleanWord(o.cuisine);

  const tags = readList(o.tags, { tags: true });
  const diet = [...readList(o.diet), ...tags].filter(
    (d, i, all): d is Diet => (DIETS as readonly string[]).includes(d) && all.indexOf(d) === i
  );

  return {
    total_minutes: readMinutes(o.total_minutes),
    meal: meal && (MEALS as readonly string[]).includes(meal) ? (meal as Meal) : null,
    mains: readList(o.mains),
    cuisine: cuisine && !refusedWord(cuisine) ? cuisine : null,
    equipment: readList(o.equipment),
    diet,
    tags: tags.filter((t) => !(DIETS as readonly string[]).includes(t)),
    rating: opts.rating ? readRating(o.rating) : null,
  };
}

/** "35 min", "1 h", "1 h 30". For the pill. */
export function formatMinutes(minutes: number | null): string | null {
  if (!minutes || minutes < 1) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

/**
 * What the pill says about a recipe beyond its name and its kcal, in the order
 * agreed: meal, main, cuisine. Rating and time are rendered separately because
 * they stay visible on a phone; these give way first.
 */
export function pillFacts(meta: Pick<RecipeMeta, "meal" | "mains" | "cuisine">): string[] {
  return [meta.meal, meta.mains[0] ?? null, meta.cuisine].filter((f): f is string => Boolean(f));
}

/**
 * The fields a model is asked for, as JSON-schema properties. **No `rating`**:
 * a model is never asked for one. Enumerated vocabularies are described rather
 * than schema-enforced, because `readMeta` is the enforcement either way.
 */
export const META_SCHEMA_PROPERTIES = {
  total_minutes: { type: ["integer", "null"] },
  meal: { type: ["string", "null"] },
  mains: { type: "array", items: { type: "string" } },
  cuisine: { type: ["string", "null"] },
  equipment: { type: "array", items: { type: "string" } },
  diet: { type: "array", items: { type: "string" } },
  tags: { type: "array", items: { type: "string" } },
} as const;

export const META_KEYS = Object.keys(META_SCHEMA_PROPERTIES);

/** The same fields, said in a prompt. Shared so the three ways in ask for them identically. */
export const META_PROMPT = `Also describe the dish, for deciding what to cook:

- "total_minutes": start to plate, including oven and resting time; null if you cannot tell.
- "meal": one of ${MEALS.join(", ")}; null if none fits.
- "mains": what the dish is built around, one or two words each — ["chicken"], ["lentils", "spinach"].
- "cuisine": one or two words — "thai", "mexican"; null if it has none in particular.
- "equipment": anything beyond a hob, a pan and a knife — ["oven"], ["slow cooker"]; [] if nothing.
- "diet": only from ${DIETS.join(", ")}, and **only when every ingredient allows it** — fish sauce is
  not vegetarian, and honey is not vegan. [] when in doubt.
- "tags": up to five short words a cook would search for — "one-pot", "freezer", "weeknight".
- **Never say what the dish is free of** — no "gluten-free", "dairy-free", "nut-free", no allergens.
  That claim is not made here at all.
- **Never tag anything about its nutrition** — no "high protein", "low carb", "keto", "light".
  Those are worked out from the numbers.`;

export const META_JSON_HINT =
  `"total_minutes": number or null, "meal": string or null, "mains": [string], ` +
  `"cuisine": string or null, "equipment": [string], "diet": [string], "tags": [string]`;
