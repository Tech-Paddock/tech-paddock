import { DIETS, MEALS, formatMinutes, timeMinutes, type Diet, type Meal, type RecipeMeta } from "./metadata";

/**
 * The tuning section (2026-09-26): the same four options — meal,
 * diet, cuisine, time — **as pickers on Ask Claude** that steer a new draft and
 * come back tagged on it, and **as filters on the book**. (The book's High
 * protein filter was dropped in TEC-189; a macro fact is still never stored.)
 *
 * Pure and imported by the browser, so it never imports `supabase.ts`.
 */

export type Picks = {
  meal: Meal | null;
  diet: Diet | null;
  cuisine: string | null;
  /** "Under N minutes", start to plate. */
  max_minutes: number | null;
};

export const NO_PICKS: Picks = { meal: null, diet: null, cuisine: null, max_minutes: null };

/** The time choices offered. A cap, not a target: "under 30" is met by a 15-minute dish. */
export const TIME_CHOICES = [20, 30, 45, 60, 90] as const;

const MAX_CUISINE = 40;

export function hasPicks(p: Picks): boolean {
  return Boolean(p.meal || p.diet || p.cuisine || p.max_minutes);
}

/** Picks off untrusted input — a request body. Anything not on a list is dropped, not guessed. */
export function readPicks(raw: unknown): Picks {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const word = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").toLowerCase() : "");
  const meal = word(o.meal);
  const diet = word(o.diet);
  const cuisine = word(o.cuisine);
  const minutes = typeof o.max_minutes === "string" ? Number(o.max_minutes) : o.max_minutes;
  return {
    meal: (MEALS as readonly string[]).includes(meal) ? (meal as Meal) : null,
    diet: (DIETS as readonly string[]).includes(diet) ? (diet as Diet) : null,
    cuisine: cuisine && cuisine.length <= MAX_CUISINE ? cuisine : null,
    max_minutes: (TIME_CHOICES as readonly number[]).includes(minutes as number) ? (minutes as number) : null,
  };
}

/** The picks as requirements in a generate prompt. Empty when nothing is picked. */
export function picksPrompt(p: Picks): string {
  const lines = [
    p.meal ? `- It is a ${p.meal}.` : null,
    p.diet ? `- It is ${p.diet} — every ingredient, including stocks and sauces.` : null,
    p.cuisine ? `- The cuisine is ${p.cuisine}.` : null,
    p.max_minutes ? `- It takes under ${p.max_minutes} minutes start to plate, oven and resting included.` : null,
  ].filter(Boolean);
  if (lines.length === 0) return "";
  return `Requirements they picked — all of them hold, and the metadata you return says so:\n${lines.join("\n")}`;
}

/**
 * **What satisfies a diet.** A vegan dish is vegetarian, and both are
 * pescatarian-friendly, so a filter for "vegetarian" shows the vegan dishes too.
 */
export function dietSatisfies(have: readonly Diet[], want: Diet): boolean {
  if (have.includes(want)) return true;
  if (want === "vegetarian") return have.includes("vegan");
  if (want === "pescatarian") return have.includes("vegetarian") || have.includes("vegan");
  return false;
}

/**
 * **The draft comes back tagged with what was picked** — with one exception kept
 * honest. Meal and cuisine are a description, so the pick is written onto the
 * draft. **Diet is a claim about every ingredient**, so it is tagged only when
 * the model's own reading agrees; when it does not, the draft is not tagged and
 * the note says so, because a "vegetarian" label on a dish with fish sauce in it
 * is the one wrong tag here someone would act on. **Time is the model's estimate**
 * and is kept as it said; an overrun or a missing time is noted, not overwritten.
 *
 * Returns the metadata to put on the draft and any notes to show beside it.
 */
export function tagWithPicks(meta: RecipeMeta, p: Picks): { meta: RecipeMeta; notes: string[] } {
  const notes: string[] = [];
  const next: RecipeMeta = { ...meta };
  if (p.meal) next.meal = p.meal;
  if (p.cuisine) next.cuisine = p.cuisine;
  if (p.diet && !dietSatisfies(meta.diet, p.diet)) {
    notes.push(`You asked for ${p.diet}, and Claude did not mark this one ${p.diet} — check the ingredients before you keep it.`);
  }
  if (p.max_minutes) {
    // Prep plus cook (TEC-189), else the old total.
    const took = timeMinutes(meta);
    if (took === null) notes.push(`You asked for under ${p.max_minutes} minutes; Claude gave no time.`);
    else if (took > p.max_minutes) {
      notes.push(`You asked for under ${p.max_minutes} minutes; Claude reckons ${formatMinutes(took)}.`);
    }
  }
  return { meta: next, notes };
}

// ---------------------------------------------------------------------------
// Filters on the book
// ---------------------------------------------------------------------------

/** The book's filters are the four picks and nothing else (TEC-189 dropped High protein). */
export type BookFilter = Picks;

export const NO_FILTER: BookFilter = NO_PICKS;

export function filterActive(f: BookFilter): boolean {
  return hasPicks(f);
}

/**
 * Does a recipe pass the filter? **A recipe with a field unset does not pass a
 * filter on that field** — "under 30 minutes" is not a claim anything can make
 * about a recipe with no time. The time is prep plus cook, falling back to the
 * old total (`timeMinutes`). Every filter set must hold.
 */
export function matchesFilter(r: RecipeMeta, f: BookFilter): boolean {
  if (f.meal && r.meal !== f.meal) return false;
  if (f.diet && !dietSatisfies(r.diet, f.diet)) return false;
  if (f.cuisine && r.cuisine !== f.cuisine) return false;
  if (f.max_minutes) {
    const took = timeMinutes(r);
    if (took === null || took > f.max_minutes) return false;
  }
  return true;
}

/** The cuisines in the book, for the pickers' suggestions and the filter's list. */
export function cuisinesIn(recipes: readonly Pick<RecipeMeta, "cuisine">[]): string[] {
  return [...new Set(recipes.map((r) => r.cuisine).filter((c): c is string => Boolean(c)))].sort();
}
