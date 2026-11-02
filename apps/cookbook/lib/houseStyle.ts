/**
 * The house style (TEC-201): how every recipe in the book reads.
 *
 * **Written once, used by every model path that writes a recipe**: Ask Claude,
 * a link, a file and a typed recipe. The prompt text (`HOUSE_STYLE`) goes
 * into each of those prompts, and the checks below (`spellUnits`,
 * `restyleProblem`) run in code on what comes back, because a prompt can only ask.
 *
 * **The recipe itself never changes.** Style moves words, it does not add or drop
 * an ingredient or change an amount. `restyleProblem` is the code that says so:
 * the same number of ingredient lines, the same leading amount and unit on each,
 * and every number the method had.
 *
 * Pure: no database, no model, no React.
 */

/** The rules, as the prompt says them. Interpolated into each system prompt. */
export const HOUSE_STYLE = `THE HOUSE STYLE. Every recipe in this book reads the same way:

- **An ingredient line is amount, unit, item**: "1 cup onion", "2 tbsp olive oil", "3 cloves garlic".
  Write the item in the singular after a measure ("1 cup onion", not "1 cup onions").
- **Prep words are not part of an ingredient.** What you do to the item ("chopped", "thinly sliced",
  "peeled", "minced", "diced", "grated", "drained", "rinsed", "softened", "melted") moves into the method
  as an action: "1 cup onion, chopped" becomes "1 cup onion" and the method says "Chop the onion."
  Keep what describes the item itself or the amount: "canned", "fresh", "dried", "boneless", "to taste",
  "optional", a size in brackets.
- **The method is numbered, imperative steps**, one per line, separated by real newlines: "1. …\\n2. …".
  Each step starts with a verb ("Chop", "Add", "Simmer"). Put each moved prep action where the cook
  needs it, at the start of the step that uses the item. Every time, temperature and amount the
  method already had stays in it.
- **One spelling for each unit**, in the ingredients and in the method: tsp, tbsp, oz, lb, °F (and °C),
  and "cup" for an amount of 1 or less ("1 cup", "½ cup") but "cups" above 1 ("2 cups", "1½ cups").
  Never "teaspoon", "Tbsp", "ounces", "pounds", "degrees F".
- **THE RECIPE ITSELF NEVER CHANGES.** Do not add, drop, merge or split an ingredient. Do not change
  an amount or a unit's quantity. Keep the ingredients in their order and every ingredient line,
  headings included, as a line. Do not change the name.`;

// ---------------------------------------------------------------------------
// One spelling for each unit
// ---------------------------------------------------------------------------

const UNIT_SPELLINGS: Record<string, string> = {
  teaspoon: "tsp",
  teaspoons: "tsp",
  tsp: "tsp",
  tsps: "tsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbsp: "tbsp",
  tbsps: "tbsp",
  tbs: "tbsp",
  cup: "cup",
  cups: "cup",
  ounce: "oz",
  ounces: "oz",
  oz: "oz",
  pound: "lb",
  pounds: "lb",
  lb: "lb",
  lbs: "lb",
};

/** Units whose quantity is compared as well as the number: a cup is not a tbsp. */
const COMPARED_UNITS: Record<string, string> = {
  ...UNIT_SPELLINGS,
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  l: "l",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
};

const VULGAR = "¼½¾⅓⅔⅛⅜⅝⅞";

/**
 * A recipe's text with each unit in its one spelling. Only a unit that follows a
 * number is touched ("2 tablespoons" becomes "2 tbsp"), so "cup" in "a cupboard"
 * or "pound the chicken" is left alone. A cup is "cup" for 1 or less and "cups" above 1. A trailing full stop is taken only when
 * the abbreviation is followed by more of the line ("1 tbsp. olive oil"), so the
 * end of a sentence keeps its own.
 */
export function spellUnits(text: string): string {
  const unitWords = "teaspoons?|tsps?|tablespoons?|tbsps?|tbs|cups?|ounces?|oz|pounds?|lbs?";
  const unit = new RegExp(`(\\d+\\s+\\d+\\/\\d+|\\d+\\s*[${VULGAR}]|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[${VULGAR}])\\s*(${unitWords})(?![A-Za-z])(\\.)?`, "gi");
  return text
    .replace(unit, (m: string, qty: string, word: string, dot: string | undefined, offset: number, whole: string) => {
      // The abbreviation's full stop goes only when more of the line follows it, in lower case or a number;
      // before a capital it is the end of a sentence and stays.
      const abbreviation = dot && /^\s*[a-z0-9,(]/.test(whole.slice(offset + m.length));
      const spelled = UNIT_SPELLINGS[word.toLowerCase()];
      // A cup is "cup" up to 1 and "cups" above it; every other unit has the one spelling.
      const name = spelled === "cup" && qtyValue(qty) > 1 ? "cups" : spelled;
      return `${qty} ${name}${dot && !abbreviation ? "." : ""}`;
    })
    .replace(/(\d)\s*(?:°|º|degrees?\s|deg\.?\s?)\s*(F|Fahrenheit|C|Celsius)\b/gi, (_m, d: string, scale: string) => `${d}°${scale[0].toUpperCase()}`)
    .replace(/(?<![\w/.])(\d{3})\s?°?\s?F\b/g, "$1°F");
}

// ---------------------------------------------------------------------------
// Amounts: what must survive a restyle
// ---------------------------------------------------------------------------

const FRACTION_VALUES: Record<string, number> = {
  "¼": 0.25,
  "½": 0.5,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

const QTY = `(?:\\d+\\s+\\d+\\/\\d+|\\d+\\s*[${VULGAR}]|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[${VULGAR}])`;
const LEADING = new RegExp(`^\\s*(?:(?:(a|an)\\s)|(${QTY})(?:\\s*(?:-|–|—|to)\\s*(${QTY}))?)(?:\\s*([A-Za-z]+)\\b)?`, "i");

function qtyValue(token: string): number {
  const t = token.trim();
  let m = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = t.match(/^(\d+)\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/);
  if (m) return Number(m[1]) + FRACTION_VALUES[m[2]];
  m = t.match(/^(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  if (t in FRACTION_VALUES) return FRACTION_VALUES[t];
  return Number(t);
}

export type Amount = { low: number; high: number | null; unit: string | null } | null;

/**
 * The amount an ingredient line leads with: a number, a fraction, a mixed number
 * or a range, then its unit if the next word is one. "a" and "an" read as 1.
 * Null for a line that leads with no amount ("Salt, to taste", a heading).
 */
export function leadingAmount(line: string): Amount {
  const m = line.match(LEADING);
  if (!m) return null;
  if (m[1]) return { low: 1, high: null, unit: m[4] ? (COMPARED_UNITS[m[4].toLowerCase()] ?? null) : null };
  return {
    low: qtyValue(m[2]),
    high: m[3] ? qtyValue(m[3]) : null,
    unit: m[4] ? (COMPARED_UNITS[m[4].toLowerCase()] ?? null) : null,
  };
}

const close = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < 1e-6);

function sameAmount(a: Amount, b: Amount): boolean {
  if (a === null || b === null) return a === b;
  return close(a.low, b.low) && close(a.high, b.high) && a.unit === b.unit;
}

/** The numbers in a method, without its step markers, with fractions written one way. */
function numbersIn(method: string): Set<string> {
  // Step markers are not amounts: "1. Chop", and the "2." of a method run together on one line.
  const text = method
    .replace(/(?:^|\s)\d{1,2}[.)]\s+(?=[A-Za-z])/g, " ")
    .replace(/(\d)\s*([¼½¾⅓⅔⅛⅜⅝⅞])/g, (_m, whole: string, f: string) => `${Number(whole) + FRACTION_VALUES[f]}`)
    .replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, (f) => `${FRACTION_VALUES[f]}`);
  const found = text.match(/\d+(?:[./]\d+)?/g) ?? [];
  return new Set(found.map((n) => (n.includes("/") ? String(qtyValue(n)) : String(Number(n)))));
}

export type Styleable = { ingredients: string[]; method: string | null };

/**
 * Did a restyle leave the recipe alone? **Null when it did, else the sentence.**
 *
 * - the same number of ingredient lines;
 * - on each line, the same leading amount and unit (so "1 cup onions, chopped"
 *   and "1 cup onion" agree, and "2 cup onion" does not);
 * - every number the method had is still in it (a time, a temperature, an
 *   amount), though a step may now say it in a new place.
 *
 * Not checked: the item words, and numbers inside an ingredient line that are not
 * its leading amount (a "(14 oz)" size). A model could still change those; the
 * review screen shows before and after for exactly that reason.
 */
export function restyleProblem(before: Styleable, after: Styleable): string | null {
  if (before.ingredients.length !== after.ingredients.length) {
    return `it came back with ${after.ingredients.length} ingredient lines, not ${before.ingredients.length}`;
  }
  for (let i = 0; i < before.ingredients.length; i++) {
    if (!sameAmount(leadingAmount(before.ingredients[i]), leadingAmount(after.ingredients[i]))) {
      return `the amount changed on "${before.ingredients[i]}"`;
    }
  }
  if (before.method) {
    const kept = numbersIn(after.method ?? "");
    for (const n of numbersIn(before.method)) {
      if (!kept.has(n)) return `the method lost the number ${n}`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Servings
// ---------------------------------------------------------------------------

/**
 * The serving count in an imported yield text, or null when it gave none: blank,
 * words only, or a pan size ("9x13") rather than a count. "Serves 4-6" reads 4;
 * "Makes 24 cookies" reads 24. The first whole number from 1 to 99 is the count.
 */
export function yieldCount(text: unknown): number | null {
  if (typeof text !== "string") return null;
  const t = text.trim();
  if (!t) return null;
  if (/\d+\s*[x×]\s*\d+/i.test(t)) return null;
  const m = t.match(/\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
}
