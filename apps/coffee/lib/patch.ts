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
 * Two things follow, and both are the point:
 *
 * **Nothing to change is success.** The row exists. There is no failure to
 * report, so the request is not made at all rather than made and forgiven —
 * a route that accepted an empty PATCH would hide the next caller's mistake.
 *
 * **Only what moved is sent.** A form that posts every field it rendered will
 * eventually post a blank over something another screen wrote while it was
 * open. Comparing against what was loaded is what stops that.
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
