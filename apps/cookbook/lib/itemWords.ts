/**
 * A list line reduced to the item alone (TEC-131; `RULES.md`, *Send to cart*).
 *
 * "6 cloves of garlic" is a recipe's instruction; King Soopers sells "garlic
 * cloves". Before a line goes to Kroger's search, and before it is matched
 * against a saved product's official Kroger name, **a fixed rule** drops
 * quantities, numbers and fractions, units, sizing adjectives and prep words,
 * and reads "X of Y" as "Y X". **No model**, and no imports: the rule is this
 * file, and `tests/itemWords.test.ts` holds its edges.
 *
 * The note after " — " never reaches here: `splitLine` keeps it out of the
 * line's name.
 *
 * Deliberate edges:
 * - **"2%" is not a quantity.** A number with a percent sign stays.
 * - **A count before pack, pk or ct stays**, with the word: "12 pack coke
 *   zero" searches as written, because a multipack is a different product.
 * - **"cream of …" is not flipped**: "cream of mushroom soup" is the item.
 * - Words that change the product ("whole", "ground", "fresh", "frozen") stay.
 */

const UNITS = new Set([
  "c", "cup", "cups",
  "tbsp", "tbs", "tbsps", "tablespoon", "tablespoons", "t",
  "tsp", "tsps", "teaspoon", "teaspoons",
  "oz", "ounce", "ounces", "fl",
  "lb", "lbs", "pound", "pounds",
  "g", "gram", "grams", "kg", "kilogram", "kilograms",
  "ml", "milliliter", "milliliters", "l", "liter", "liters", "litre", "litres",
  "qt", "quart", "quarts", "pt", "pint", "pints", "gal", "gallon", "gallons",
  "can", "cans", "jar", "jars", "bottle", "bottles", "bag", "bags", "box", "boxes",
  "package", "packages", "pkg", "pkgs", "packet", "packets", "carton", "cartons",
  "container", "containers", "tub", "tubs",
  "bunch", "bunches", "head", "heads", "stick", "sticks", "sprig", "sprigs",
  "slice", "slices", "piece", "pieces", "pinch", "pinches", "dash", "dashes",
  "handful", "handfuls", "dozen",
]);

/** Packaging counts that name a product ("12 pack"), so the number before them stays. */
const PACKS = new Set(["pack", "packs", "pk", "ct", "count"]);

const SIZING = new Set(["large", "medium", "small", "extra", "x-large", "jumbo", "heaping", "level", "scant", "generous"]);

const PREP = new Set([
  "chopped", "minced", "diced", "sliced", "grated", "shredded", "crushed", "peeled", "cubed",
  "julienned", "halved", "quartered", "trimmed", "rinsed", "drained", "melted", "softened",
  "beaten", "whisked", "sifted", "packed", "divided", "optional", "finely", "roughly",
  "coarsely", "thinly", "thickly", "freshly", "lightly", "firmly", "cut", "torn", "seeded",
  "deseeded", "cored", "pitted", "zested", "juiced", "mashed", "toasted", "room", "temperature",
  "taste", "needed", "serving", "garnish", "plus", "more", "about", "approximately", "into",
  "pieces", "chunks", "strips", "wedges", "rings", "cubes",
]);

const NUMBER_WORDS = new Set([
  "a", "an", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "half", "quarter", "third", "few", "several", "some", "couple",
]);

/** Leading or trailing joiners left behind once the quantity is gone. */
const JOINERS = new Set(["of", "and", "or", "to", "for", "at", "as", "with", "the"]);

const NO_FLIP = new Set(["cream"]);

function isNumber(token: string): boolean {
  // 6, 1.5, 1/2, 2-3, 1½, ½, 12oz-style run-ons are handled by `isRunOnUnit`.
  return /^(\d+([./,]\d+)?|\d*[¼½¾⅓⅔⅛⅜⅝⅞]|\d+([./]\d+)?[-–]\d+([./]\d+)?)$/.test(token);
}

function isRunOnUnit(token: string): boolean {
  const m = /^\d+([./]\d+)?([a-z]+)$/.exec(token);
  return !!m && UNITS.has(m[2]);
}

/**
 * The item alone, lowercase, words separated by single spaces. **Empty** when
 * nothing is left ("2 cups"): the caller then uses the line as typed.
 */
export function itemWords(name: string): string {
  let text = name.toLowerCase();
  // Parentheses are asides ("(optional)", "(about 2 cups)").
  text = text.replace(/\([^)]*\)/g, " ");
  // "salt, to taste": punctuation becomes a break; "%" and "'" stay part of a word.
  text = text.replace(/[^a-z0-9%'¼½¾⅓⅔⅛⅜⅝⅞./\-–\s]+/g, " ");
  const raw = text.split(/\s+/).filter(Boolean).map((t) => t.replace(/^[.\-–/]+|[.\-–/]+$/g, "")).filter(Boolean);

  const kept: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const token = raw[i];
    const next = raw[i + 1];
    if (token.endsWith("%")) {
      kept.push(token);
      continue;
    }
    if ((isNumber(token) && next && PACKS.has(next)) || PACKS.has(token)) {
      // "12 pack" names a product; keep the count and the word.
      kept.push(token);
      continue;
    }
    if (isNumber(token) || isRunOnUnit(token)) continue;
    if (UNITS.has(token) || SIZING.has(token) || PREP.has(token) || NUMBER_WORDS.has(token)) continue;
    // "fl oz" leaves "oz" handled above; a stray "x2" or "×2" is a quantity.
    if (/^[x×]\d+$/.test(token)) continue;
    kept.push(token);
  }

  // Joiners at the ends are what the dropped words were joined by.
  while (kept.length > 0 && JOINERS.has(kept[0])) kept.shift();
  while (kept.length > 0 && JOINERS.has(kept[kept.length - 1])) kept.pop();

  // "cloves of garlic" → "garlic cloves". Only the first "of", only with words
  // on both sides.
  const at = kept.indexOf("of");
  if (at > 0 && at < kept.length - 1 && !NO_FLIP.has(kept[0])) {
    const before = kept.slice(0, at);
    const after = kept.slice(at + 1).filter((t) => !JOINERS.has(t) || t === "and");
    return [...after, ...before].join(" ");
  }
  return kept.join(" ");
}

/** Lowercase whole words, for matching against a product's official name. */
export function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9%]+/)
    .filter(Boolean);
}

/** The same word, allowing a plural on either side: "onion" and "onions", "box" and "boxes". */
export function sameWord(a: string, b: string): boolean {
  return a === b || a + "s" === b || b + "s" === a || a + "es" === b || b + "es" === a;
}

/**
 * Do these item words all appear, as whole words, in this official name? Order
 * is free: "garlic cloves" is in "Fresh Peeled Garlic Cloves" and in "Cloves
 * of Garlic".
 */
export function itemInName(item: string, officialName: string): boolean {
  const want = wordsOf(item);
  if (want.length === 0) return false;
  const have = wordsOf(officialName);
  return want.every((w) => have.some((h) => sameWord(w, h)));
}
