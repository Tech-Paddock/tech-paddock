/**
 * Greyed-out rows on an open recipe (TEC-222). Tap an ingredient or a step while
 * cooking and it greys; tap again and it comes back. The state is kept per recipe
 * in this browser's localStorage with the time of the last tap, and clears itself
 * 24 hours after that tap. There is no Clear button and nothing goes to the
 * database. This file is pure: the component owns storage and the clock.
 */

export const GREY_TTL_MS = 24 * 60 * 60 * 1000;

export type GreyKind = "ingredient" | "step";

export type Greyed = {
  /** Time of the last tap, in ms since the epoch. */
  at: number;
  ingredients: number[];
  steps: number[];
};

export const NO_GREY: Greyed = { at: 0, ingredients: [], steps: [] };

export function greyKey(recipeId: string): string {
  return `cookbook:greyed:${recipeId}`;
}

/** Expired once a full 24 hours have passed since the last tap: the boundary itself is expired. */
export function isExpired(at: number, now: number): boolean {
  return now - at >= GREY_TTL_MS;
}

function indexes(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const out: number[] = [];
  for (const n of value) {
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) return null;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/** What was stored, or null when it is missing, malformed or past 24 hours. */
export function readGreyed(raw: string | null | undefined, now: number): Greyed | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const { at, ingredients, steps } = data as Record<string, unknown>;
  if (typeof at !== "number" || !Number.isFinite(at) || isExpired(at, now)) return null;
  const ing = indexes(ingredients);
  const stp = indexes(steps);
  if (!ing || !stp) return null;
  if (ing.length === 0 && stp.length === 0) return null;
  return { at, ingredients: ing, steps: stp };
}

/** The current state with one row flipped and the last-tap time set to now. */
export function toggleGreyed(current: Greyed | null, kind: GreyKind, index: number, now: number): Greyed {
  const base = current && !isExpired(current.at, now) ? current : NO_GREY;
  const key = kind === "ingredient" ? "ingredients" : "steps";
  const list = base[key].includes(index) ? base[key].filter((n) => n !== index) : [...base[key], index];
  return { ...base, [key]: list, at: now };
}

export function isGreyed(state: Greyed | null, kind: GreyKind, index: number): boolean {
  if (!state) return false;
  return (kind === "ingredient" ? state.ingredients : state.steps).includes(index);
}

/** The text to store, or null when nothing is greyed (the key is then removed). */
export function writeGreyed(state: Greyed): string | null {
  if (state.ingredients.length === 0 && state.steps.length === 0) return null;
  return JSON.stringify(state);
}
