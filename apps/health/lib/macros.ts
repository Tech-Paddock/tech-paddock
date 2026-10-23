/**
 * Macros and their arithmetic.
 *
 * Nothing here touches the database or a model, so it is pure and it is tested.
 */

export type Macros = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

/**
 * Where a number came from. `hand` and `cookbook` name no model; `web` and
 * `estimate` always do, and the database's `model_matches_source` says the
 * same. `cookbook` is a recipe's per-serving numbers as the Cookbook returned
 * them (TEC-25) — the Cookbook's own, so the fix for one belongs there.
 */
export type MacroSource = "hand" | "web" | "estimate" | "cookbook";

export const MACRO_SOURCES: readonly MacroSource[] = ["hand", "web", "estimate", "cookbook"];

export function isMacroSource(value: unknown): value is MacroSource {
  return typeof value === "string" && (MACRO_SOURCES as readonly string[]).includes(value);
}

/** The sources whose numbers name no model. */
export function namesNoModel(source: MacroSource): boolean {
  return source === "hand" || source === "cookbook";
}

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

export function add(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein_g: a.protein_g + b.protein_g,
    carbs_g: a.carbs_g + b.carbs_g,
    fat_g: a.fat_g + b.fat_g,
  };
}

export function total(items: { macros: Macros; quantity: number }[]): Macros {
  return items.reduce((acc, i) => add(acc, scale(i.macros, i.quantity)), ZERO);
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

/** Reads a Macros off an untrusted object — a model response, or a jsonb column. */
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
