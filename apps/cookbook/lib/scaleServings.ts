/**
 * The servings dial on an open recipe (TEC-235). Pure and import-free, so the
 * browser and the tests take it as is.
 *
 * The dial is **per view**: it scales what the ingredients list shows and never
 * touches the stored servings, the stored lines or the macros. A line with no
 * leading number ("tortillas, as needed") comes back exactly as written, and at
 * the stored servings every line does, so the dial at rest changes nothing.
 */

export const MIN_SERVINGS = 1;
export const MAX_SERVINGS = 99;

/** One step of the dial, kept inside the allowed range. */
export function stepServings(current: number, delta: 1 | -1): number {
  const next = Math.round(current) + delta;
  return Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, next));
}

/** The factor the dial applies: view over stored. A bad stored count scales by 1. */
export function scaleFactor(view: number, stored: number): number {
  if (!(stored > 0) || !(view > 0)) return 1;
  return view / stored;
}

/* ---------------------------------------------------------------------- */
/* Reading a leading quantity                                              */
/* ---------------------------------------------------------------------- */

const VULGAR_VALUE: Record<string, number> = {
  "¼": 1 / 4,
  "½": 1 / 2,
  "¾": 3 / 4,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅛": 1 / 8,
  "⅜": 3 / 8,
  "⅝": 5 / 8,
  "⅞": 7 / 8,
};
const VULGAR_CLASS = Object.keys(VULGAR_VALUE).join("");

// One number: "1 1/2", "3/4", "2.5", "1½", "1 ½", "½", or "2". Longest forms first.
const ONE = `(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?\\s?[${VULGAR_CLASS}]|\\d+(?:[.,]\\d+)?|[${VULGAR_CLASS}])`;
// A quantity is one number or a range of two ("2-3", "2 to 3", "1–2").
const LEADING = new RegExp(`^(\\s*)(${ONE})(?:(\\s*(?:-|–|to)\\s*)(${ONE}))?(?![\\d/.,${VULGAR_CLASS}])`, "i");

function valueOf(text: string): number | null {
  const t = text.trim();
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t);
  if (mixed) return Number(mixed[3]) === 0 ? null : Number(mixed[2]) / Number(mixed[3]) + Number(mixed[1]);
  const frac = /^(\d+)\/(\d+)$/.exec(t);
  if (frac) return Number(frac[2]) === 0 ? null : Number(frac[1]) / Number(frac[2]);
  const withVulgar = new RegExp(`^(\\d+(?:[.,]\\d+)?)?\\s?([${VULGAR_CLASS}])$`).exec(t);
  if (withVulgar) return (withVulgar[1] ? Number(withVulgar[1].replace(",", ".")) : 0) + VULGAR_VALUE[withVulgar[2]];
  if (/^\d+(?:[.,]\d+)?$/.test(t)) return Number(t.replace(",", "."));
  return null;
}

/* ---------------------------------------------------------------------- */
/* Writing a quantity as a kitchen fraction                                */
/* ---------------------------------------------------------------------- */

// The fractions a cook measures with, nearest wins: eighths and thirds.
const FRACTIONS: { value: number; glyph: string }[] = [
  { value: 0, glyph: "" },
  { value: 1 / 8, glyph: "⅛" },
  { value: 1 / 4, glyph: "¼" },
  { value: 1 / 3, glyph: "⅓" },
  { value: 3 / 8, glyph: "⅜" },
  { value: 1 / 2, glyph: "½" },
  { value: 5 / 8, glyph: "⅝" },
  { value: 2 / 3, glyph: "⅔" },
  { value: 3 / 4, glyph: "¾" },
  { value: 7 / 8, glyph: "⅞" },
  { value: 1, glyph: "" },
];

/**
 * A quantity as a cook writes it: "1½", "⅓", "2". Under 20 it rounds to the
 * nearest eighth or third; from 20 up it is a whole number, because "20¼ oz" is
 * not a measure anyone takes. A small positive amount never rounds to nothing:
 * it shows as ⅛.
 */
export function formatQuantity(n: number): string {
  if (!(n > 0) || !Number.isFinite(n)) return "0";
  if (n >= 20) return String(Math.round(n));
  const whole = Math.floor(n);
  const rest = n - whole;
  let best = FRACTIONS[0];
  for (const f of FRACTIONS) if (Math.abs(f.value - rest) < Math.abs(best.value - rest)) best = f;
  let w = whole;
  let glyph = best.glyph;
  if (best.value === 1) {
    w += 1;
    glyph = "";
  }
  if (w === 0 && glyph === "") glyph = "⅛";
  return `${w > 0 ? w : ""}${glyph}`;
}

/* ---------------------------------------------------------------------- */
/* Scaling a line                                                          */
/* ---------------------------------------------------------------------- */

/**
 * One ingredient line scaled by `factor`. Only a number at the very start of the
 * line is scaled (a range scales both ends); the unit and the words after it are
 * kept exactly. A line with no leading number, a line like "2-inch piece of
 * ginger" where the number is a size, and a factor of 1 all come back untouched.
 */
export function scaleIngredient(line: string, factor: number): string {
  if (factor === 1 || !(factor > 0) || !Number.isFinite(factor)) return line;
  const m = LEADING.exec(line);
  if (!m) return line;
  const [whole, lead, first, between, second] = m;
  const rest = line.slice(whole.length);
  // "2-inch piece": a hyphen straight into a word is a size, not a range.
  if (/^-[a-z]/i.test(rest)) return line;
  const a = valueOf(first);
  if (a === null || !(a > 0)) return line;
  const scaledA = formatQuantity(a * factor);
  if (second === undefined) return `${lead}${scaledA}${rest}`;
  const b = valueOf(second);
  if (b === null || !(b > 0)) return line;
  return `${lead}${scaledA}${between}${formatQuantity(b * factor)}${rest}`;
}
