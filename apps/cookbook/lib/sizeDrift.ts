/**
 * Size drift (TEC-131; `RULES.md`, *Storage*): the size first bought beside
 * the size Kroger reports now. "was 12 oz, now 10 oz", with price per unit
 * where both sizes parse into the same kind of unit.
 *
 * **No imports**: Your brands runs this in the browser, and the refresh runs it
 * to name a change in its report. Kroger's sizes are free text ("12 oz",
 * "1 gal", "16.9 fl oz", "12 pk / 12 fl oz", "2 lb"); what does not parse
 * still shows as words, only without a per-unit price.
 */

export type Dimension = "weight" | "volume" | "count";

/** An amount in the dimension's base unit: ounces, fluid ounces, or items. */
export type Measure = { amount: number; dimension: Dimension };

const UNIT: Record<string, { dimension: Dimension; factor: number }> = {
  oz: { dimension: "weight", factor: 1 },
  ounce: { dimension: "weight", factor: 1 },
  ounces: { dimension: "weight", factor: 1 },
  lb: { dimension: "weight", factor: 16 },
  lbs: { dimension: "weight", factor: 16 },
  pound: { dimension: "weight", factor: 16 },
  pounds: { dimension: "weight", factor: 16 },
  g: { dimension: "weight", factor: 1 / 28.3495 },
  gram: { dimension: "weight", factor: 1 / 28.3495 },
  grams: { dimension: "weight", factor: 1 / 28.3495 },
  kg: { dimension: "weight", factor: 1000 / 28.3495 },
  "fl oz": { dimension: "volume", factor: 1 },
  floz: { dimension: "volume", factor: 1 },
  ml: { dimension: "volume", factor: 1 / 29.5735 },
  l: { dimension: "volume", factor: 1000 / 29.5735 },
  liter: { dimension: "volume", factor: 1000 / 29.5735 },
  liters: { dimension: "volume", factor: 1000 / 29.5735 },
  litre: { dimension: "volume", factor: 1000 / 29.5735 },
  pt: { dimension: "volume", factor: 16 },
  pint: { dimension: "volume", factor: 16 },
  qt: { dimension: "volume", factor: 32 },
  quart: { dimension: "volume", factor: 32 },
  gal: { dimension: "volume", factor: 128 },
  gallon: { dimension: "volume", factor: 128 },
  ct: { dimension: "count", factor: 1 },
  count: { dimension: "count", factor: 1 },
  pk: { dimension: "count", factor: 1 },
  pack: { dimension: "count", factor: 1 },
  each: { dimension: "count", factor: 1 },
  ea: { dimension: "count", factor: 1 },
};

const BASE: Record<Dimension, string> = { weight: "oz", volume: "fl oz", count: "each" };

function number(text: string): number | null {
  const t = text.trim();
  const fraction = /^(\d+)\/(\d+)$/.exec(t);
  if (fraction) return Number(fraction[2]) === 0 ? null : Number(fraction[1]) / Number(fraction[2]);
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** One "<amount> <unit>" piece, or null. */
function piece(text: string): Measure | null {
  const m = /^\s*(\d+(?:\.\d+)?|\d+\/\d+)\s*(fl\.?\s*oz|[a-z]+)\.?\s*$/i.exec(text);
  if (!m) return null;
  const amount = number(m[1]);
  const unitText = m[2].toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  const unit = UNIT[unitText];
  if (amount === null || !unit) return null;
  return { amount: amount * unit.factor, dimension: unit.dimension };
}

/**
 * A size as an amount, or null when it does not parse. A multipack — "12 pk /
 * 12 fl oz", "6 ct / 1.5 oz" — is the count times the piece.
 */
export function parseSize(size: string | null | undefined): Measure | null {
  if (!size) return null;
  const parts = size.toLowerCase().split(/\s*\/\s*|\s+[x×]\s+/).filter(Boolean);
  if (parts.length === 1) return piece(parts[0]);
  if (parts.length === 2) {
    const a = piece(parts[0]);
    const b = piece(parts[1]);
    if (a && b && a.dimension === "count" && b.dimension !== "count") return { amount: a.amount * b.amount, dimension: b.dimension };
    if (a && b && b.dimension === "count" && a.dimension !== "count") return { amount: a.amount * b.amount, dimension: a.dimension };
    // "2 x 6 oz": a bare count before the piece.
    const n = number(parts[0]);
    if (n !== null && b && b.dimension !== "count") return { amount: n * b.amount, dimension: b.dimension };
  }
  return null;
}

function squash(size: string): string {
  return size.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

/**
 * The same size? The same words, or the same amount (within half a percent,
 * so "1 lb" and "16 oz" are one size).
 */
export function sameSize(a: string, b: string): boolean {
  if (squash(a) === squash(b)) return true;
  const x = parseSize(a);
  const y = parseSize(b);
  return !!x && !!y && x.dimension === y.dimension && Math.abs(x.amount - y.amount) <= 0.005 * Math.max(x.amount, y.amount);
}

export type Drift = {
  was: string;
  now: string;
  /** At today's price, per base unit, at both sizes. Absent when a size does not parse or there is no price. */
  perUnit?: { unit: string; was: number; now: number; price: number };
};

/** The drift between the size first bought and the size now, or null when there is none to show. */
export function sizeDrift(sizeFirst: string | null | undefined, sizeNow: string | null | undefined, price: number | null | undefined): Drift | null {
  if (!sizeFirst || !sizeNow || sameSize(sizeFirst, sizeNow)) return null;
  const drift: Drift = { was: sizeFirst.trim(), now: sizeNow.trim() };
  const a = parseSize(sizeFirst);
  const b = parseSize(sizeNow);
  if (a && b && a.dimension === b.dimension && typeof price === "number" && price > 0) {
    drift.perUnit = { unit: BASE[a.dimension], was: price / a.amount, now: price / b.amount, price };
  }
  return drift;
}

function money(n: number): string {
  return n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;
}

/**
 * "was 12 oz, now 10 oz — $3.49 is $0.349/oz now, $0.291/oz at 12 oz". The
 * per-unit figures are both at today's price: the size first bought has no
 * price stored, and the point is what the same money buys now.
 */
export function describeDrift(drift: Drift): string {
  const words = `was ${drift.was}, now ${drift.now}`;
  if (!drift.perUnit) return words;
  const { unit, was, now, price } = drift.perUnit;
  return `${words} — ${money(price)} is ${money(now)}/${unit} now, ${money(was)}/${unit} at ${drift.was}`;
}
