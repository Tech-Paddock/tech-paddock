/**
 * Macros, their arithmetic, and what it means for two estimates to agree.
 *
 * Nothing here touches the database or a model. It is the part the debug
 * harness's headline number depends on, so it is pure and it is tested.
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

/**
 * Two estimates agree when they are close enough that choosing between them
 * would be noise.
 *
 * **A numeric tolerance rather than string equality**, because two estimates of
 * the same sandwich will essentially never be byte-identical and a harness that
 * asks you to arbitrate 620 against 625 forty times a week is a harness you
 * stop reading by Thursday.
 *
 * Each threshold is a relative band with an absolute floor, and the floor is
 * the half that matters: 20% of 2g of fat is 0.4g, which would make every
 * low-fat item disagree over a rounding difference.
 */
export const TOLERANCE = {
  /** Calories: the headline number, so the tighter band. */
  kcal: { relative: 0.1, floor: 25 },
  /** Macros: noisier at source, and a few grams does not change a decision. */
  macro: { relative: 0.2, floor: 5 },
} as const;

function within(a: number, b: number, band: { relative: number; floor: number }): boolean {
  const allowed = Math.max(band.floor, Math.max(Math.abs(a), Math.abs(b)) * band.relative);
  return Math.abs(a - b) <= allowed;
}

/**
 * Every field has to agree. One wildly wrong macro inside an otherwise close
 * estimate is exactly the disagreement worth surfacing — averaging it away
 * would hide the only interesting case.
 */
export function agrees(a: Macros, b: Macros): boolean {
  return (
    within(a.kcal, b.kcal, TOLERANCE.kcal) &&
    within(a.protein_g, b.protein_g, TOLERANCE.macro) &&
    within(a.carbs_g, b.carbs_g, TOLERANCE.macro) &&
    within(a.fat_g, b.fat_g, TOLERANCE.macro)
  );
}

/** Which fields disagree, for a harness that should say what differs rather than that something does. */
export function disagreements(a: Macros, b: Macros): (keyof Macros)[] {
  return MACRO_KEYS.filter((k) =>
    !within(a[k], b[k], k === "kcal" ? TOLERANCE.kcal : TOLERANCE.macro)
  );
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
