import { itemWords } from "./itemWords";

/**
 * A list line as what you buy (TEC-131; `RULES.md`, *Storage*):
 *
 *     Heads of Garlic — 14 cloves · Soup, Curry          ×2
 *
 * - **The name** is the item without quantities or prep words (`itemWords`,
 *   the same cleaner the search uses): "garlic, thinly sliced" → "Garlic". A
 *   saved product's shopping-unit label wins when one decides the line
 *   ("Heads of Garlic").
 * - **The amount** is the line's recipe amounts added up: same units add,
 *   known conversions combine (tsp/tbsp/cup, oz/lb, g/kg), fractions stay
 *   readable ("1/4 tsp and 1/2 tsp" → "3/4 tsp"), anything else is listed side
 *   by side. Amounts come from the front of the name and from a note made only
 *   of amounts (what Tidy writes); any other note still shows.
 * - **The cart quantity**, rounded up: with the product's pack conversion
 *   (1 head = 10 cloves) the amount in packs; without one, a typed count ("2
 *   onions", "3 bunches cilantro"), and one container for a measure (tsp, cup).
 *
 * **Fixed rules, no model, no database**: the stored line is never rewritten
 * for display, and `tests/lineView.test.ts` holds the edges.
 */

/** A fraction, kept exact so "1/3 + 1/3" reads as "2/3". */
export type Fraction = { n: number; d: number };

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

function frac(n: number, d = 1): Fraction {
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
}

function add(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d);
}

function times(a: Fraction, k: Fraction): Fraction {
  return frac(a.n * k.n, a.d * k.d);
}

function value(a: Fraction): number {
  return a.n / a.d;
}

/** A decimal as a fraction, to a sixteenth's precision. */
function fromDecimal(x: number): Fraction {
  const d = 48;
  return frac(Math.round(x * d), d);
}

const UNICODE: Record<string, Fraction> = {
  "¼": frac(1, 4), "½": frac(1, 2), "¾": frac(3, 4), "⅓": frac(1, 3), "⅔": frac(2, 3),
  "⅛": frac(1, 8), "⅜": frac(3, 8), "⅝": frac(5, 8), "⅞": frac(7, 8),
};

/** "1", "1/2", "1½", "½", "0.5", "2-3" (the larger, so there is enough). */
function readNumber(token: string): Fraction | null {
  const t = token.replace(/–/g, "-");
  const range = /^([^-]+)-([^-]+)$/.exec(t);
  if (range) return readNumber(range[2]);
  const mixedUnicode = /^(\d*)([¼½¾⅓⅔⅛⅜⅝⅞])$/.exec(t);
  if (mixedUnicode) return add(frac(Number(mixedUnicode[1] || 0)), UNICODE[mixedUnicode[2]]);
  const slash = /^(\d+)\/(\d+)$/.exec(t);
  if (slash) return Number(slash[2]) === 0 ? null : frac(Number(slash[1]), Number(slash[2]));
  if (/^\d+(\.\d+)?$/.test(t)) return Number.isInteger(Number(t)) ? frac(Number(t)) : fromDecimal(Number(t));
  return null;
}

type Kind = "measure" | "pack";

/** Recipe units: canonical name, plural, and whether a count of them is a count of things to buy. */
const UNITS: Record<string, { unit: string; plural: string; kind: Kind }> = {};
function unit(names: string[], canonical: string, plural: string, kind: Kind) {
  for (const n of names) UNITS[n] = { unit: canonical, plural, kind };
}
unit(["tsp", "tsps", "teaspoon", "teaspoons"], "tsp", "tsp", "measure");
unit(["tbsp", "tbsps", "tbs", "tablespoon", "tablespoons", "tbl"], "tbsp", "tbsp", "measure");
unit(["cup", "cups", "c"], "cup", "cups", "measure");
unit(["fl oz", "floz"], "fl oz", "fl oz", "measure");
unit(["oz", "ounce", "ounces"], "oz", "oz", "measure");
unit(["lb", "lbs", "pound", "pounds"], "lb", "lb", "measure");
unit(["g", "gram", "grams"], "g", "g", "measure");
unit(["kg", "kilogram", "kilograms"], "kg", "kg", "measure");
unit(["ml", "milliliter", "milliliters", "millilitre", "millilitres"], "ml", "ml", "measure");
unit(["l", "liter", "liters", "litre", "litres"], "l", "l", "measure");
unit(["qt", "quart", "quarts"], "qt", "qt", "measure");
unit(["pt", "pint", "pints"], "pt", "pt", "measure");
unit(["pinch", "pinches"], "pinch", "pinches", "measure");
unit(["dash", "dashes"], "dash", "dashes", "measure");
unit(["clove", "cloves"], "clove", "cloves", "measure");
unit(["slice", "slices"], "slice", "slices", "measure");
unit(["sprig", "sprigs"], "sprig", "sprigs", "measure");
unit(["stalk", "stalks"], "stalk", "stalks", "measure");
unit(["stick", "sticks"], "stick", "sticks", "measure");
unit(["piece", "pieces"], "piece", "pieces", "measure");
unit(["handful", "handfuls"], "handful", "handfuls", "measure");
unit(["leaf", "leaves"], "leaf", "leaves", "measure");
unit(["head", "heads"], "head", "heads", "pack");
unit(["bunch", "bunches"], "bunch", "bunches", "pack");
unit(["can", "cans", "tin", "tins"], "can", "cans", "pack");
unit(["jar", "jars"], "jar", "jars", "pack");
unit(["bottle", "bottles"], "bottle", "bottles", "pack");
unit(["bag", "bags"], "bag", "bags", "pack");
unit(["box", "boxes"], "box", "boxes", "pack");
unit(["package", "packages", "pkg", "pkgs"], "package", "packages", "pack");
unit(["packet", "packets"], "packet", "packets", "pack");
unit(["carton", "cartons"], "carton", "cartons", "pack");
unit(["container", "containers", "tub", "tubs"], "container", "containers", "pack");
unit(["loaf", "loaves"], "loaf", "loaves", "pack");
unit(["dozen"], "dozen", "dozen", "pack");

/** Known conversions, to a base unit per family. */
const FAMILY: Record<string, { family: string; toBase: Fraction }> = {
  tsp: { family: "volume", toBase: frac(1) },
  tbsp: { family: "volume", toBase: frac(3) },
  cup: { family: "volume", toBase: frac(48) },
  "fl oz": { family: "volume", toBase: frac(6) },
  pt: { family: "volume", toBase: frac(96) },
  qt: { family: "volume", toBase: frac(192) },
  oz: { family: "weight", toBase: frac(1) },
  lb: { family: "weight", toBase: frac(16) },
  g: { family: "metric weight", toBase: frac(1) },
  kg: { family: "metric weight", toBase: frac(1000) },
  ml: { family: "metric volume", toBase: frac(1) },
  l: { family: "metric volume", toBase: frac(1000) },
};

/** One amount: a number and a canonical unit, or null for a plain count ("2 onions"). */
export type Amount = { qty: Fraction; unit: string | null };

/**
 * The amount at the front of some words, and what is left. "1 1/2 cups
 * chopped onion" → 3/2 cup, "chopped onion"; "6 cloves of garlic" → 6 clove,
 * "garlic"; "2 onions" → 2, "onions".
 */
export function leadingAmount(text: string): { amount: Amount | null; rest: string } {
  // Asides are not amounts: "1 (14 oz) can tomatoes" is one can.
  const tokens = text.replace(/\([^)]*\)/g, " ").trim().split(/\s+/).filter(Boolean);
  let i = 0;
  let qty = readNumber((tokens[0] ?? "").replace(/,$/, ""));
  if (qty) {
    i = 1;
    // "1 1/2", "1 ½": a whole number, then a fraction.
    const next = readNumber((tokens[1] ?? "").replace(/,$/, ""));
    if (qty.d === 1 && next && next.d !== 1 && value(next) < 1) {
      qty = add(qty, next);
      i = 2;
    }
  }
  // "a" and "an" count as one only before a unit: "a pinch of salt".
  if (!qty && /^(a|an)$/i.test(tokens[0] ?? "") && UNITS[(tokens[1] ?? "").toLowerCase()]) {
    qty = frac(1);
    i = 1;
  }
  if (!qty) return { amount: null, rest: text.trim() };
  // "12 pack coke zero", "6 ct eggs": the count names the product, not an amount (as in `itemWords`).
  if (/^(pack|packs|pk|ct|count)$/i.test(tokens[i] ?? "")) return { amount: null, rest: text.trim() };

  let found: string | null = null;
  const one = (tokens[i] ?? "").toLowerCase().replace(/[.,]$/, "");
  const two = `${one} ${(tokens[i + 1] ?? "").toLowerCase().replace(/[.,]$/, "")}`;
  if (UNITS[two]) {
    found = UNITS[two].unit;
    i += 2;
  } else if (UNITS[one]) {
    found = UNITS[one].unit;
    i += 1;
  }
  if (found && (tokens[i] ?? "").toLowerCase() === "of") i++;
  return { amount: { qty, unit: found }, rest: tokens.slice(i).join(" ") };
}

/**
 * A note that is only amounts — "1/4 tsp and 1/2 tsp", "2 cloves + 1 tbsp
 * minced" — read as amounts. Null when any part is not an amount, so a typed
 * note ("the big box") shows as written.
 */
export function noteAmounts(note: string | null | undefined): Amount[] | null {
  if (!note || !note.trim()) return null;
  const parts = note
    .replace(/\btotal\b/gi, " ")
    .split(/\s*(?:\band\b|\+|,|;|&)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const out: Amount[] = [];
  for (const part of parts) {
    const { amount } = leadingAmount(part);
    if (!amount) return null;
    out.push(amount);
  }
  return out;
}

/** Same units added, known conversions combined into the smallest unit present, the rest side by side. */
export function combine(amounts: Amount[]): Amount[] {
  const groups = new Map<string, Amount[]>();
  for (const a of amounts) {
    const key = a.unit === null ? "count" : (FAMILY[a.unit]?.family ?? `unit:${a.unit}`);
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const out: Amount[] = [];
  for (const [key, group] of groups) {
    if (!FAMILY[group[0].unit ?? ""] || key === "count" || key.startsWith("unit:")) {
      out.push({ qty: group.reduce((sum, a) => add(sum, a.qty), frac(0)), unit: group[0].unit });
      continue;
    }
    // The smallest unit present, so nothing becomes a fraction of a cup.
    const smallest = group.reduce((s, a) => (value(FAMILY[a.unit as string].toBase) < value(FAMILY[s].toBase) ? (a.unit as string) : s), group[0].unit as string);
    const base = group.reduce((sum, a) => add(sum, times(a.qty, FAMILY[a.unit as string].toBase)), frac(0));
    const per = FAMILY[smallest].toBase;
    out.push({ qty: frac(base.n * per.d, base.d * per.n), unit: smallest });
  }
  return out;
}

/** "3/4", "1 1/2", "2". */
export function formatFraction(f: Fraction): string {
  const whole = Math.floor(f.n / f.d);
  const rest = f.n - whole * f.d;
  if (rest === 0) return String(whole);
  // An odd denominator from a decimal reads better as a decimal.
  if (f.d > 16) return String(Math.round((f.n / f.d) * 100) / 100);
  return whole > 0 ? `${whole} ${rest}/${f.d}` : `${rest}/${f.d}`;
}

function unitWord(unit: string, qty: Fraction): string {
  const entry = Object.values(UNITS).find((u) => u.unit === unit);
  if (!entry) return unit;
  return value(qty) > 1 ? entry.plural : entry.unit;
}

export function formatAmounts(amounts: Amount[]): string {
  return amounts.map((a) => (a.unit ? `${formatFraction(a.qty)} ${unitWord(a.unit, a.qty)}` : formatFraction(a.qty))).join(" + ");
}

/** A product's pack conversion: one `label` holds `size` of the recipe unit `unit` (1 head = 10 cloves). */
export type Pack = { label: string | null; size: number | null; unit: string | null };

/** A unit as this file names it ("cloves" → "clove"), or null. */
export function canonicalUnit(text: string | null | undefined): string | null {
  if (!text) return null;
  return UNITS[text.trim().toLowerCase()]?.unit ?? null;
}

/**
 * What goes in the cart, rounded up and at least one. See the header for the
 * rules; `amounts` are the line's combined amounts.
 */
export function cartQuantity(amounts: Amount[], pack: Pack | null): number {
  // A pack unit this file does not know ("eggs") counts plain numbers: "12 eggs", 12 per carton.
  const packUnit = pack?.unit?.trim() ? canonicalUnit(pack.unit) : undefined;
  if (pack?.size && pack.size > 0 && packUnit !== undefined) {
    let total = 0;
    let used = false;
    for (const a of amounts) {
      if (a.unit === packUnit) {
        total += value(a.qty);
        used = true;
      } else if (a.unit && packUnit && FAMILY[a.unit] && FAMILY[packUnit] && FAMILY[a.unit].family === FAMILY[packUnit].family) {
        total += value(a.qty) * (value(FAMILY[a.unit].toBase) / value(FAMILY[packUnit].toBase));
        used = true;
      }
    }
    if (used) return Math.max(1, Math.ceil(total / pack.size - 1e-9));
  }
  // A typed count, or a count of packs ("3 bunches"), is the quantity.
  let counted = 0;
  for (const a of amounts) {
    if (a.unit === null || UNITS[a.unit]?.kind === "pack") counted += value(a.qty);
  }
  if (counted > 0) return Math.max(1, Math.ceil(counted - 1e-9));
  // A measure is one container.
  return 1;
}

/**
 * **Bulk produce reads as a bag** (TEC-190; `RULES.md`, *Storage*). Fixed
 * rules, no model, the owner's table of 2026-10-29: more than 3 onions is a 3 lb
 * bag, more than 3 potatoes a 5 lb bag, more than 4 carrots a 2 lb bag, more
 * than 4 lemons or limes a bag. It applies only to a plain count of the plain
 * item ("5 onions", "6 russet potatoes"): a measure ("2 cups chopped onion"),
 * "green onions", "sweet potatoes" and anything else with a different noun are
 * not bulk. The stored line is never rewritten; the bag is how the line is
 * shown, searched and counted.
 */
type Bulk = { noun: RegExp; adjectives: string[]; over: number; size: string };

const BULK: Bulk[] = [
  { noun: /^onions?$/, adjectives: ["yellow", "white", "red", "sweet", "spanish"], over: 3, size: "3 lb bag" },
  { noun: /^potatoes$|^potato$/, adjectives: ["russet", "red", "yellow", "gold", "golden", "white", "yukon", "baking", "idaho", "new"], over: 3, size: "5 lb bag" },
  { noun: /^carrots?$/, adjectives: [], over: 4, size: "2 lb bag" },
  { noun: /^lemons?$/, adjectives: [], over: 4, size: "2 lb bag" },
  // The owner said "a bag" and gave no weight for limes, so none is invented.
  { noun: /^limes?$/, adjectives: [], over: 4, size: "bag" },
];

export type Bag = {
  /** The item as written, without quantities: "yellow onions". */
  item: string;
  /** "3 lb bag". */
  size: string;
  /** What the line is searched and matched as: "yellow onions 3 lb bag". */
  phrase: string;
  /** What the line was: "5 onions". */
  was: string;
};

/** The bag a line reads as, or null when it is not bulk produce over its limit. */
export function bagOf(line: { name: string; note: string | null }): Bag | null {
  const { amount, rest } = leadingAmount(line.name);
  const fromNote = noteAmounts(line.note);
  const amounts = combine([...(amount ? [amount] : []), ...(fromNote ?? [])]);
  if (amounts.length !== 1 || amounts[0].unit !== null) return null;
  const count = value(amounts[0].qty);
  const item = itemWords(rest);
  const tokens = item.split(" ").filter(Boolean);
  if (tokens.length === 0) return null;
  const noun = tokens[tokens.length - 1];
  const rule = BULK.find((b) => b.noun.test(noun) && tokens.slice(0, -1).every((t) => b.adjectives.includes(t)));
  if (!rule || !(count > rule.over)) return null;
  return { item, size: rule.size, phrase: `${item} ${rule.size}`, was: `${formatFraction(amounts[0].qty)} ${item}` };
}

/**
 * The name a line is matched and searched as: the bag's phrase for bulk
 * produce, else the line as typed. A saved product named for the bag
 * ("onions 3 lb bag") beats search, as any saved product does.
 */
export function readAs(line: { name: string; note?: string | null }): string {
  return bagOf({ name: line.name, note: line.note ?? null })?.phrase ?? line.name;
}

export type LineView = {
  /** The item, as shown: the product's shopping-unit label, else the cleaned item, capitalised. */
  name: string;
  /** The combined amount, or null. A bag reads "was 5 onions". */
  amount: string | null;
  /** The note, unless it was only amounts. */
  note: string | null;
  /** What the rules put in the cart. The stored quantity is what is sent; this is set when a line is added. */
  quantity: number;
  /** Set when the line reads as a bag of bulk produce (TEC-190). */
  bag?: Bag;
};

function capitalise(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/** A list line as what you buy. `pack` is the saved product that decides the line, when one does. */
export function lineView(line: { name: string; note: string | null }, pack: Pack | null): LineView {
  const { amount, rest } = leadingAmount(line.name);
  const fromNote = noteAmounts(line.note);
  const amounts = combine([...(amount ? [amount] : []), ...(fromNote ?? [])]);
  const item = itemWords(rest) || itemWords(line.name) || line.name.trim();
  // A saved product with its own pack conversion decides the quantity; the bag rule is for the rest.
  const bag = pack?.label?.trim() || pack?.size ? null : bagOf(line);
  if (bag) {
    return {
      name: capitalise(`${bag.item}, ${bag.size}`),
      amount: `was ${bag.was}`,
      note: fromNote ? null : line.note,
      quantity: 1,
      bag,
    };
  }
  return {
    name: pack?.label?.trim() || capitalise(item),
    amount: amounts.length > 0 ? formatAmounts(amounts) : null,
    note: fromNote ? null : line.note,
    quantity: cartQuantity(amounts, pack),
  };
}
