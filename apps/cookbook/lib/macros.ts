/**
 * Macros and their arithmetic. No database, no model, no React — which is why
 * this is the file the tests lean on hardest.
 *
 * **A deliberately smaller copy of Health's `lib/macros.ts`.** The tolerance
 * band and the `agrees`/`disagreements` pair are not here: they exist for
 * Health's debug harness, which compares two models' estimates of the same
 * food. This app has no harness and no second opinion to arbitrate, so carrying
 * them would be carrying dead code that looks like a promise.
 */

export type Macros = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

/**
 * Where a number came from.
 *
 * **Two values, where Health has three.** There is no `web`, because a recipe's
 * macros are always this app's own estimate of its ingredients — even for an
 * imported recipe whose page published a nutrition panel. The enum in the
 * database is the same two values, so a lifted number is not storable rather
 * than merely not written.
 */
export type MacroSource = "hand" | "estimate";

export const MACRO_KEYS = ["kcal", "protein_g", "carbs_g", "fat_g"] as const;

export const MACRO_LABELS: Record<keyof Macros, string> = {
  kcal: "Calories",
  protein_g: "Protein",
  carbs_g: "Carbs",
  fat_g: "Fat",
};

export const ZERO: Macros = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

export function scale(m: Macros, quantity: number): Macros {
  return {
    kcal: m.kcal * quantity,
    protein_g: m.protein_g * quantity,
    carbs_g: m.carbs_g * quantity,
    fat_g: m.fat_g * quantity,
  };
}

/** Display rounding. Stored values keep their decimals; only the screen rounds. */
export function round(m: Macros): Macros {
  return {
    kcal: Math.round(m.kcal),
    protein_g: Math.round(m.protein_g),
    carbs_g: Math.round(m.carbs_g),
    fat_g: Math.round(m.fat_g),
  };
}

/** Reads a Macros off an untrusted object — a model response, or a row. */
export function parseMacros(value: unknown): Macros | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const out = {} as Macros;
  for (const k of MACRO_KEYS) {
    const n = typeof raw[k] === "string" ? Number(raw[k]) : raw[k];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
    out[k] = n;
  }
  return out;
}
