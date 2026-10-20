/**
 * The food catalogue, fixed in code. The owner, 2026-10-20: "add them as the
 * defaults + Misc no other options". There is no "add another"; a new food is
 * a code change.
 *
 * Calories are recorded with every food event and never shown ("track but not
 * yet surface"). Each event snapshots the item's id, name, kcal-per and unit at
 * log time (`lib/events.ts:foodSnapshot`), so editing an item here never
 * rewrites history.
 *
 * To take an item off the picklist, mark it `retired: true` rather than
 * deleting it: its old entries can then still be corrected. Misc stays last in
 * each list.
 */

export const FOOD_TYPES = ["meal", "treat"] as const;
export type FoodType = (typeof FOOD_TYPES)[number];

export type Food = {
  /** Stable forever: events store it. Lowercase letters, digits and dashes. */
  id: string;
  name: string;
  /** Calories per `unit`; null for Misc, whose calories are unknown. */
  kcalPer: number | null;
  /** What the amount counts, singular: "cup", "piece". Null for Misc. */
  unit: string | null;
  retired?: boolean;
};

export const MISC_ID = "misc";

export const FOODS: Record<FoodType, Food[]> = {
  meal: [
    {
      id: "purina-pro-plan-toy-puppy-chicken-rice",
      name: "Purina Pro Plan High Protein Toy Breed Puppy, Chicken & Rice",
      // 447 kcal/cup (4003 kcal/kg): manufacturer figures as listed by PetSmart.
      kcalPer: 447,
      unit: "cup",
    },
    { id: MISC_ID, name: "Misc", kcalPer: null, unit: null },
  ],
  treat: [
    {
      id: "freeze-dried-beef-hearts",
      name: "Freeze-dried beef hearts",
      // 1.33 kcal/piece: from the owner, off the label; brand unknown.
      kcalPer: 1.33,
      unit: "piece",
    },
    {
      id: "woof-pupsicle-refill-pop-small",
      name: "Woof Pupsicle refill pop (small)",
      // 90 kcal/pop: retailer figure.
      kcalPer: 90,
      unit: "pop",
    },
    {
      id: "bixbi-pocket-trainers-bacon",
      name: "Bixbi Pocket Trainers, Bacon",
      // 2.78 kcal/treat: label average.
      kcalPer: 2.78,
      unit: "treat",
    },
    { id: MISC_ID, name: "Misc", kcalPer: null, unit: null },
  ],
};

/** The picklist: every item not retired, Misc last. */
export function picklist(type: FoodType): Food[] {
  const live = FOODS[type].filter((f) => !f.retired);
  return [...live.filter((f) => f.id !== MISC_ID), ...live.filter((f) => f.id === MISC_ID)];
}

/** Any item, retired or not, so an old entry can still be corrected. */
export function findFood(type: FoodType, id: string): Food | null {
  return FOODS[type].find((f) => f.id === id) ?? null;
}

/** "1/3 cup", "1 cup", "2 cups": plural above one. Units here are all regular. */
export function unitLabel(unit: string, amount: number | null): string {
  return amount !== null && amount <= 1 ? unit : `${unit}s`;
}

const FRACTIONS: [number, string][] = [
  [1 / 4, "1/4"],
  [1 / 3, "1/3"],
  [1 / 2, "1/2"],
  [2 / 3, "2/3"],
  [3 / 4, "3/4"],
];

/** 0.333 → "1/3", 1.5 → "1 1/2", 2 → "2", 0.4 → "0.4". */
export function formatAmount(n: number): string {
  const whole = Math.floor(n + 1e-9);
  const rest = n - whole;
  if (rest < 0.005) return String(whole);
  for (const [v, s] of FRACTIONS) if (Math.abs(rest - v) < 0.01) return whole ? `${whole} ${s}` : s;
  return String(Math.round(n * 100) / 100);
}

/**
 * What a person types into Amount: "2", "0.5", "0,5", "1/3", "1 1/2". Null for
 * empty or unreadable, so the form can say so. Kept to three decimals.
 */
export function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!s) return null;
  let n: number;
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
  const frac = /^(\d+)\/(\d+)$/.exec(s);
  if (mixed) n = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  else if (frac) n = Number(frac[1]) / Number(frac[2]);
  else if (/^\d*\.?\d+$/.test(s)) n = Number(s);
  else return null;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1000) / 1000;
}
