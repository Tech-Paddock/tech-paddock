/**
 * One error type, for the one failure this app is not allowed to smooth over.
 *
 * **A failed read must never render as an empty book.** "Nothing in it yet" and
 * "the database did not answer" look identical on a screen and mean opposite
 * things — the first invites you to add a recipe, the second means the one you
 * added last week is still there and you cannot see it. Health learned this as
 * its own rule ("never let a failed lookup look like 'not found'"), and it is
 * the same rule here because it is a property of reading a collection, not of
 * counting calories.
 *
 * Every lib function that touches Supabase throws this with a sentence worth
 * showing, and every route turns it into a 503 rather than a 200 with an empty
 * array.
 */
export class LookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LookupError";
  }
}
