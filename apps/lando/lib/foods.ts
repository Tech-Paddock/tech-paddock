/**
 * The food catalogue: the foods in code below, plus the foods added in the app
 * (`lando.foods`, TEC-191). The owner, 2026-10-20, fixed the list in code ("add
 * them as the defaults + Misc no other options"); on 2026-10-29 he asked for
 * "Add a food…" on the Food form, so the picklist is the two together, Misc
 * last. An added food is passed in as `added` wherever a list is read.
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

/**
 * What a food entry's type can be. A snuffle mat (TEC-195) is its own type in the journal but picks from the meal
 * list, and everything meal-based counts it as a meal (`isMealType`).
 */
export const FOOD_TYPES = ["meal", "snuffle", "treat"] as const;
export type FoodType = (typeof FOOD_TYPES)[number];

/** The two lists foods live in: `lando.foods.type` and `FOODS` hold these only. */
export type ListType = "meal" | "treat";

/** The list a food type picks from: a snuffle mat picks from the meal list. */
export function listOf(type: FoodType): ListType {
  return type === "treat" ? "treat" : "meal";
}

/** A meal or a snuffle mat: what the Meal pill, time since last meal, meal gaps and quick log count as a meal. */
export function isMealType(type: FoodType): boolean {
  return type !== "treat";
}

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

/** What an added food can count in (TEC-191), in the order the form offers them. */
export const FOOD_UNITS = ["cup", "scoop", "piece", "treat", "pop", "gram"] as const;
export type FoodUnit = (typeof FOOD_UNITS)[number];

/** A food added in the app, as `lando.foods` holds it. Its `id` is history's key: never deleted, never changed. */
export type AddedFood = Food & { type: ListType };

export const FOODS: Record<ListType, Food[]> = {
  meal: [
    {
      id: "purina-pro-plan-toy-puppy-chicken-rice",
      name: "Purina Pro Plan High Protein Toy Breed Puppy, Chicken & Rice",
      // 447 kcal/cup (4003 kcal/kg): manufacturer figures as listed by PetSmart.
      kcalPer: 447,
      unit: "cup",
    },
    {
      id: "royal-canin-dachshund-puppy",
      name: "Royal Canin Dachshund Puppy",
      // 369 kcal/cup (3,649 kcal/kg ME, as fed, calculated): Royal Canin's own figure for Breed Health
      // Nutrition Dachshund Puppy dry (royalcanin.com/us product page; PetSmart lists the same).
      kcalPer: 369,
      unit: "cup",
    },
    // Retired (TEC-195): a snuffle mat is now a food type that picks from this list. Kept, never deleted,
    // so an entry logged with it under TEC-193 still reads and corrects.
    { id: "snuffle-mat", name: "Snuffle mat", kcalPer: null, unit: "cup", retired: true },
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

/** The code catalogue then the foods added in the app, for one list. */
function every(type: FoodType, added: readonly AddedFood[]): Food[] {
  const list = listOf(type);
  return [...FOODS[list], ...added.filter((f) => f.type === list)];
}

/** The picklist: every item not retired, the code catalogue then added foods, Misc last. */
export function picklist(type: FoodType, added: readonly AddedFood[] = []): Food[] {
  const live = every(type, added).filter((f) => !f.retired);
  return [...live.filter((f) => f.id !== MISC_ID), ...live.filter((f) => f.id === MISC_ID)];
}

/** Any item, retired or not, so an old entry can still be corrected. */
export function findFood(type: FoodType, id: string, added: readonly AddedFood[] = []): Food | null {
  return every(type, added).find((f) => f.id === id) ?? null;
}

/** A name as typed: outer spaces off, inner runs of spaces made one. */
export function cleanFoodName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Whether a name is already in a list (code or added, retired too), ignoring case and outer spaces. */
export function foodNameTaken(type: FoodType, name: string, added: readonly AddedFood[] = []): boolean {
  const n = cleanFoodName(name).toLowerCase();
  return every(type, added).some((f) => f.name.trim().toLowerCase() === n);
}

/** "1/3 cup", "1 cup", "2 cups": plural above one. Units here are all regular. */
export function unitLabel(unit: string, amount: number | null): string {
  return amount !== null && amount <= 1 ? unit : `${unit}s`;
}

const FRACTIONS: [number, string][] = [
  [1 / 8, "1/8"],
  [1 / 4, "1/4"],
  [1 / 3, "1/3"],
  [3 / 8, "3/8"],
  [1 / 2, "1/2"],
  [5 / 8, "5/8"],
  [2 / 3, "2/3"],
  [3 / 4, "3/4"],
  [7 / 8, "7/8"],
];

/** 0.125 → "1/8", 0.333 → "1/3", 1.5 → "1 1/2", 2 → "2", 0.4 → "0.4". Eighths reduce: 0.25 → "1/4". */
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

/* ── The amount scroller (TEC-136) ───────────────────────────────────────── */

/** The scroller steps in eighths. */
export const AMOUNT_STEP = 1 / 8;
/**
 * The scroller's last step. The stored bound is still above 0 and at most
 * 1000 (`parseDetails`); the picker offers the useful part of it.
 */
export const AMOUNT_PICKER_MAX = 20;

/**
 * What the amount scroller offers: null (no amount, as before) and then every
 * eighth from 1/8 to `AMOUNT_PICKER_MAX`. Each `keep` is an amount the form
 * opened on (or a default it fell back to) that is not an eighth or is past
 * the end (an older entry's 1/3, a phone's remembered 0.4): it is slotted in at
 * its place, so a correction never changes an amount nobody touched.
 */
export function amountOptions(...keep: (number | null)[]): (number | null)[] {
  const steps: number[] = [];
  for (let i = 1; i <= AMOUNT_PICKER_MAX / AMOUNT_STEP; i++) steps.push(i * AMOUNT_STEP);
  for (const k of keep) {
    if (k !== null && k > 0 && !steps.some((v) => Math.abs(v - k) < 1e-9)) steps.push(k);
  }
  steps.sort((a, b) => a - b);
  return [null, ...steps];
}

/* ── A treat's quantity (TEC-188) ─────────────────────────────────────────── */

/**
 * Why a treat's amount cannot be saved, or null. A new treat takes a whole number of 1 or more.
 * `opened` is the amount a correction opened on (omit it for a new treat): left untouched it saves as it was, so an older
 * treat holding part of a piece is never forced to change. The stored shape and `parseDetails`
 * are unchanged; this is the form's rule.
 */
export function treatQtyError(amount: number | null, opened?: number | null): string | null {
  if (opened !== undefined && amount === opened) return null;
  if (amount === null || !Number.isInteger(amount) || amount < 1) return "Treat amount: enter a whole number, 1 or more.";
  return null;
}
