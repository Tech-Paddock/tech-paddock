/**
 * The errors this app can report, and the one status each one means.
 *
 * **A failed read must never render as an empty book.** "Nothing in it yet" and
 * "the database did not answer" look identical on a screen and mean opposite
 * things — the first invites you to add a recipe, the second means the one you
 * added last week is still there and you cannot see it. Health learned this as
 * its own rule ("never let a failed lookup look like 'not found'"), and it is
 * the same rule here because it is a property of reading a collection, not of
 * counting calories.
 *
 * **503 means only "the database didn't answer"** (TEC-29 item 7). Health reads
 * a 503 from `GET /api/servings` as "couldn't reach the Cookbook", so a refused
 * draft or a duplicate name reported as 503 would read there as an outage. Until
 * 2026-09-25 every one of them was a `LookupError`; now each failure has its own
 * type and `statusOf` is the one place that turns a type into a status.
 */

/** The database did not answer, or refused a query. **503.** */
export class LookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LookupError";
  }
}

/** What was sent is not something this app will store — a refused draft, nothing to add. **400.** */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

/**
 * What was sent collides with what is already there — a recipe name already in
 * the book, or a tidy proposal for a list that has moved since. **409.**
 */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** The status an error means. Anything unrecognised is a 500 — our fault, not the database's. */
export function statusOf(e: unknown): number {
  if (e instanceof InputError) return 400;
  if (e instanceof ConflictError) return 409;
  if (e instanceof LookupError) return 503;
  return 500;
}

/**
 * What a route's catch block sends. The recognised types carry a sentence worth
 * showing; anything else gets the route's own fallback rather than whatever an
 * unexpected error happened to say. Pure, so the tests hold the mapping.
 */
export function errorBody(e: unknown, fallback: string): { status: number; error: string } {
  const status = statusOf(e);
  const error = status === 500 || !(e instanceof Error) ? fallback : e.message;
  return { status, error };
}