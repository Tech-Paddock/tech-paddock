import { leadingAmount } from "./lineView";
import { parseSize, type Measure } from "./sizeDrift";

/**
 * Does a pack fit the line's amount (TEC-214; `RULES.md`, *Send to cart*)?
 * **Pure; fixed rules, no model.** It reuses `parseSize`'s units, where 1 lb
 * is 16 oz, so "4 lb chicken" meets a "3-5 lb" pack in the same terms.
 */

/**
 * A pack's size as an amount. A range ("3-5 lb", "approx. 1-2 lb") is read as
 * its **larger end**, what the pack can cover; anything `parseSize` reads is
 * read the same way. Null when it does not parse.
 */
export function packCapacity(size: string | null | undefined): Measure | null {
  if (!size) return null;
  const text = size.trim().toLowerCase().replace(/^(approx\.?|about|avg\.?|average)\s+/, "");
  const range = /^(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)\s*(.+)$/.exec(text);
  return parseSize(range ? `${range[2]} ${range[3]}` : text);
}

/** The amount a line asks for ("4 lb chicken" is 64 oz), or null for a plain count or a unit sizes do not use. */
export function lineAmount(name: string): Measure | null {
  const { amount } = leadingAmount(name);
  if (!amount || !amount.unit) return null;
  return parseSize(`${amount.qty.n / amount.qty.d} ${amount.unit}`);
}

const SAME = 0.005;

/**
 * Of these sizes, the indexes that fit `amount`: the **smallest that covers
 * it**, else the **closest** (the largest, when every one falls short). A size
 * of another kind of unit, or one that does not parse, takes no part. Equal
 * sizes (within half a percent) all stay. Empty when no size is comparable.
 */
export function fitting(sizes: (Measure | null)[], amount: Measure): number[] {
  const comparable = sizes.flatMap((s, i) => (s && s.dimension === amount.dimension ? [{ i, a: s.amount }] : []));
  if (comparable.length === 0) return [];
  const covering = comparable.filter((c) => c.a >= amount.amount * (1 - SAME));
  const target = covering.length > 0 ? Math.min(...covering.map((c) => c.a)) : Math.max(...comparable.map((c) => c.a));
  return comparable.filter((c) => Math.abs(c.a - target) <= SAME * Math.max(c.a, target)).map((c) => c.i);
}
