/**
 * How wide a box holding a person's name is (TEC-129: "just wide enough for a
 * name with a comfortable margin, not more"). The longest name, or the box's
 * shortest label, in `ch`, plus one `ch` of margin and room for the padding and
 * the picker's arrow. Clamped, so one very long name never pushes When off the
 * row: past `MAX_CH` the closed box truncates; the open list shows it whole.
 */

export const MIN_CH = 6;
export const MAX_CH = 14;
/** Padding both sides (2 × 0.625rem) and the native arrow. */
const CHROME = "2.75rem";

export function nameBoxWidth(names: readonly string[], minCh = MIN_CH): string {
  const longest = names.reduce((m, n) => Math.max(m, n.trim().length), 0);
  const ch = Math.min(MAX_CH, Math.max(minCh, longest)) + 1;
  return `calc(${ch}ch + ${CHROME})`;
}
