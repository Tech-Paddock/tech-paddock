/**
 * What a form actually changed — and nothing at all when it changed nothing.
 *
 * This exists because of a real bug rather than for tidiness. The review
 * screen at the end of a scan sent `{ purchased_date }` only when a purchased
 * date had been typed, so leaving that field alone sent `{}`; the PATCH route
 * correctly refuses an empty update, and the page rendered its 400 as
 * **"Couldn't save that bag."** on a bag that had been saved minutes earlier,
 * before the search even started. Joel hit it on a bag whose roaster published
 * nothing, which is the case where there is least to fill in and so the case
 * where it fires almost every time — but the trigger was the empty field, not
 * the missing recipe.
 *
 * Three things follow, and all three are the point:
 *
 * **An empty purchase date is an error, and the error says which field.**
 * Joel's call on 2026-09-19, after seeing the first fix: *"Error should say
 * purchase date required."* The first fix treated an untouched form as
 * nothing to do, which is true of the request and useless to the person —
 * **a bag is a purchase, and a purchase without a date is not one.** Saying
 * so beats silently closing the panel, and it beats "Couldn't save that bag"
 * by naming what to do about it.
 *
 * **Nothing to change is still not a failure.** Once the required field is
 * there and nothing else moved, the request is not made at all rather than
 * made and forgiven — a route that accepted an empty PATCH would hide the
 * next caller's mistake.
 *
 * **Only what moved is sent.** A form that posts every field it rendered will
 * eventually post a blank over something another screen wrote while it was
 * open. Comparing against what was loaded is what stops that.
 *
 * The requirement lives here rather than in the route or the column because
 * of when it applies. The row is written *before* the search, when there is
 * no purchase date to have — so the column is nullable and the POST cannot
 * demand one. It is a rule about finishing a bag, and this is where finishing
 * a bag is decided.
 */

/** Trimmed, with null and undefined as the empty string, so a cleared field and an absent one compare equal. */
function normalize(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function changedFields<T extends Record<string, string | null | undefined>>(
  saved: T,
  draft: T
): Partial<Record<keyof T, string | null>> {
  const patch: Partial<Record<keyof T, string | null>> = {};
  for (const key of Object.keys(draft) as (keyof T)[]) {
    const now = normalize(draft[key]);
    if (now === normalize(saved[key])) continue;
    // Cleared is null, not "". The columns are nullable and an empty string in
    // a date column is an error rather than an empty date.
    patch[key] = now === "" ? null : now;
  }
  return patch;
}

/** Whether there is anything to send. Reads better than checking the key count at every call site. */
export function hasChanges(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).length > 0;
}

/** What a bag cannot be finished without, and what to say when it is missing. */
export const REQUIRED: Record<string, string> = {
  purchased_date: "Purchase date required.",
};

/**
 * The first required field this form is missing, as the sentence to show —
 * or null when there is nothing to say.
 *
 * Keyed on what the form actually carries, not on the whole table: a screen
 * that does not render purchased_date is not failing to fill it in, and
 * blocking it on a field it never showed would be an error nobody could act
 * on.
 */
export function missingRequired(draft: Record<string, string | null | undefined>): string | null {
  for (const [field, message] of Object.entries(REQUIRED)) {
    if (field in draft && !normalize(draft[field])) return message;
  }
  return null;
}
