import type { Macros } from "./macros";

/**
 * A daily macro target: which one applies to a day, how its split rebalances,
 * and what is left of it (TEC-53).
 *
 * Pure — no database, no model — so the screen can import it and the rules are
 * tested rather than reasoned about. The reads and writes are
 * `lib/targetStore.ts`. **Nothing in this feature calls a model** (Joel:
 * "macro tracker should only be reading from database"), and
 * `tests/targets.test.ts` walks the imports to hold that.
 */

export const GRAM_KEYS = ["protein_g", "carbs_g", "fat_g"] as const;
export type GramKey = (typeof GRAM_KEYS)[number];
export type Split = Record<GramKey, number>;

/** Calories are derived from grams, never stored beside them. */
export const KCAL_PER_GRAM: Record<GramKey, number> = { protein_g: 4, carbs_g: 4, fat_g: 9 };

/** The most a gram column holds: `numeric(6,1)`. */
export const MAX_GRAMS = 99999.9;

export type Target = Split & {
  id: string;
  /** The day this target applies FROM. */
  effective_from: string;
  locked: GramKey[];
  created_at: string;
};

export function isGramKey(value: unknown): value is GramKey {
  return typeof value === "string" && (GRAM_KEYS as readonly string[]).includes(value);
}

export function kcalOf(split: Split): number {
  return GRAM_KEYS.reduce((sum, k) => sum + split[k] * KCAL_PER_GRAM[k], 0);
}

/** A target as the four numbers the day is measured in. */
export function targetMacros(split: Split): Macros {
  return { kcal: kcalOf(split), protein_g: split.protein_g, carbs_g: split.carbs_g, fat_g: split.fat_g };
}

/**
 * The target in effect on a day: the greatest `effective_from` on or before it,
 * then the most recently written row for that date.
 *
 * **No fallback to the earliest row**, unlike `resolveVersion`. A day before
 * any target has no target, and the caller says so in words. It is never a
 * target of zero, and a failed read never reaches this function — it throws
 * in `lib/targetStore.ts` first.
 */
export function targetFor<T extends { effective_from: string; created_at: string }>(
  targets: T[], onDate: string,
): T | null {
  let best: T | null = null;
  for (const t of targets) {
    if (t.effective_from > onDate) continue;
    if (
      best === null ||
      t.effective_from > best.effective_from ||
      (t.effective_from === best.effective_from && t.created_at > best.created_at)
    ) best = t;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Rebalancing. Grams are the truth; the split clamps at zero.
// ---------------------------------------------------------------------------

export type Rebalanced = {
  split: Split;
  /**
   * True when the typed number could not be honoured without a negative gram,
   * so an unlocked macro stopped at zero. The screen then shows the calories
   * the split actually reaches rather than the number that was typed.
   */
  clamped: boolean;
};

const clampGrams = (n: number) => Math.min(MAX_GRAMS, Math.max(0, Number.isFinite(n) ? n : 0));

/**
 * Spread `budget` calories across `keys` in proportion to the calories each
 * already carries — or evenly when none carries any — rounded to whole grams.
 */
function spread(split: Split, keys: GramKey[], budget: number): Split {
  const next = { ...split };
  const current = keys.reduce((s, k) => s + split[k] * KCAL_PER_GRAM[k], 0);
  for (const k of keys) {
    const share = current > 0 ? (split[k] * KCAL_PER_GRAM[k]) / current : 1 / keys.length;
    next[k] = clampGrams(Math.round((budget * share) / KCAL_PER_GRAM[k]));
  }
  return next;
}

/**
 * Set the day's calories. Locked macros hold; the unlocked ones share what is
 * left in their current proportions. **Nothing goes below zero**: if the locked
 * macros alone exceed the calories asked for, the unlocked ones stop at zero
 * and `clamped` says so. With every macro locked, nothing moves.
 */
export function setCalories(split: Split, kcal: number, locked: GramKey[]): Rebalanced {
  const free = GRAM_KEYS.filter((k) => !locked.includes(k));
  if (free.length === 0) return { split: { ...split }, clamped: false };
  const lockedKcal = GRAM_KEYS.filter((k) => locked.includes(k))
    .reduce((s, k) => s + split[k] * KCAL_PER_GRAM[k], 0);
  const wanted = Math.max(0, Number.isFinite(kcal) ? kcal : 0);
  const budget = wanted - lockedKcal;
  return { split: spread(split, free, Math.max(0, budget)), clamped: budget < 0 };
}

/**
 * Set one macro's grams. The day's calories hold, so the other unlocked macros
 * give or take the difference in their current proportions. **Nothing goes
 * below zero**: when they cannot give enough, they stop at zero, the calories
 * rise, and `clamped` says so. With no other macro unlocked, the calories move
 * instead.
 */
export function setMacro(split: Split, key: GramKey, grams: number, locked: GramKey[]): Rebalanced {
  const next = { ...split, [key]: clampGrams(grams) };
  const others = GRAM_KEYS.filter((k) => k !== key && !locked.includes(k));
  if (others.length === 0) return { split: next, clamped: false };
  const fixedKcal = GRAM_KEYS.filter((k) => !others.includes(k))
    .reduce((s, k) => s + next[k] * KCAL_PER_GRAM[k], 0);
  const budget = kcalOf(split) - fixedKcal;
  return { split: spread(next, others, Math.max(0, budget)), clamped: budget < 0 };
}

// ---------------------------------------------------------------------------
// What is left today.
// ---------------------------------------------------------------------------

/**
 * Target minus eaten, per number, **signed**: a negative is how far over. The
 * clamp at zero is for the target's split, not for this — "20g over" is an
 * answer, and hiding it as "0 left" would be a lie.
 */
export function remaining(target: Split, eaten: Macros): Macros {
  const t = targetMacros(target);
  return {
    kcal: t.kcal - eaten.kcal,
    protein_g: t.protein_g - eaten.protein_g,
    carbs_g: t.carbs_g - eaten.carbs_g,
    fat_g: t.fat_g - eaten.fat_g,
  };
}

// ---------------------------------------------------------------------------
// Validating a target that arrives from the browser.
// ---------------------------------------------------------------------------

export type TargetInput = Split & { locked: GramKey[]; effective_from: string };

/**
 * A new target applies from today and is never backdated (Joel, 2026-09-29).
 * "Today" is the phone's and is always sent, so the server cannot know it
 * exactly — but every timezone's today is within a day of UTC's, so a date
 * further out than that is a backdate or a forward-date, and refused.
 */
export function isPlausiblyToday(date: string, now: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const day = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(day)) return false;
  const utcToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.abs(day - utcToday) <= 24 * 60 * 60 * 1000;
}

/** Reads a target off an untrusted body, or says what is wrong with it. */
export function parseTargetInput(value: unknown, now: Date): TargetInput | { error: string } {
  if (!value || typeof value !== "object") return { error: "That target has nothing in it." };
  const raw = value as Record<string, unknown>;

  const split = {} as Split;
  for (const k of GRAM_KEYS) {
    const n = typeof raw[k] === "string" ? Number(raw[k]) : raw[k];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > MAX_GRAMS) {
      return { error: "Every macro needs a number of grams, zero or more." };
    }
    split[k] = Math.round(n * 10) / 10;
  }
  if (kcalOf(split) <= 0) return { error: "A target needs some calories in it." };

  const lockedRaw = raw.locked ?? [];
  if (!Array.isArray(lockedRaw) || !lockedRaw.every(isGramKey)) {
    return { error: "Only protein, carbs and fat can be locked." };
  }
  const locked = GRAM_KEYS.filter((k) => lockedRaw.includes(k));

  const effective_from = raw.effective_from;
  if (typeof effective_from !== "string" || !isPlausiblyToday(effective_from, now)) {
    return { error: "A new target starts today. It can't be backdated." };
  }

  return { ...split, locked, effective_from };
}
