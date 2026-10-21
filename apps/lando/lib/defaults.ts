/**
 * What each form starts with, remembered per phone in `localStorage`.
 *
 * Browser storage holds conveniences only: who this phone logs as, the last
 * food picked, the last weight unit and meal amount, and saves not yet made.
 * Any of it can vanish (a private window, cleared data); the forms then fall
 * back to Misc and the journal is untouched. The database is the journal.
 */

import { MISC_ID, picklist, type FoodType } from "./foods";
import type { Unit } from "./events";

export const PERSON_KEY = "lando.person";
export const DEFAULTS_KEY = "lando.defaults";
export const UNSAVED_KEY = "lando.unsaved";

export type Remembered = {
  meal?: string;
  treat?: string;
  unit?: Unit;
  mealAmount?: number;
};

export function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeStore(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private window or blocked storage: the screen still works */
  }
}

/** The item a food form opens on: the last one picked of that type, or Misc. */
export function defaultFood(type: FoodType, remembered: Remembered): string {
  const id = remembered[type];
  return id && picklist(type).some((f) => f.id === id) ? id : MISC_ID;
}

/** The amount a food form opens on: the last meal's, one treat. */
export function defaultAmount(type: FoodType, remembered: Remembered): number | null {
  if (type === "treat") return 1;
  return typeof remembered.mealAmount === "number" && remembered.mealAmount > 0 ? remembered.mealAmount : null;
}
