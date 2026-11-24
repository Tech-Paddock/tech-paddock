/**
 * Which bought-but-unsaved products the nightly scan looks up tonight
 * (paddock-issues#77). **Pure, no imports**, because the Deals board reads the
 * same arithmetic to know how old a night can be and still be today's price.
 *
 * The nightly scan always looks up **every saved product** (their history is
 * the stoplight's and Best's, and does not change). The products found only in
 * `cookbook.purchases` share what is left of the night's budget. When they all
 * fit, every one is looked up every night. When they do not, they are split
 * into `nights` slices and **each night takes one slice, in a fixed order**,
 * so each is looked up once every `nights` nights and none is ever dropped.
 *
 * **The rule.** Sort the bought codes ascending (13-digit codes, so plain
 * string order). The code at position `i` is looked up on every night whose
 * day number (days since 1970-01-01, Denver date) has `day % nights === i % nights`.
 * Interleaving rather than cutting blocks means a new code, which sorts into
 * the middle, does not push a whole block to another night.
 *
 * **Trap.** When `nights` changes (the list grew past a multiple of the
 * capacity), a code's night can move, so it can wait up to the old and new
 * length once. It is looked up again within `nights` nights of the change.
 */

/** Most codes one night looks up, saved products first. About 20 Kroger requests at fifty each. */
export const NIGHT_CODE_BUDGET = 1000;
/** The bought-but-unsaved slice never shrinks below this, however many products are saved. */
export const MIN_BOUGHT_SLICE = 100;

/** Days since 1970-01-01 for a `YYYY-MM-DD` date. */
export function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

/** How many nights it takes to look at every bought-but-unsaved code once (1 when they all fit). */
export function rotationNights(saved: number, unsaved: number): number {
  const room = Math.max(MIN_BOUGHT_SLICE, NIGHT_CODE_BUDGET - saved);
  return Math.max(1, Math.ceil(unsaved / room));
}

/** Tonight's slice of the bought-but-unsaved codes (sorted here), and the length of the rotation. */
export function tonightsBought(unsaved: string[], saved: number, night: string): { codes: string[]; nights: number } {
  const sorted = [...new Set(unsaved)].sort();
  const nights = rotationNights(saved, sorted.length);
  const slot = dayNumber(night) % nights;
  return { codes: sorted.filter((_, i) => i % nights === slot), nights };
}
