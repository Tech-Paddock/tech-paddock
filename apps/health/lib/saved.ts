/**
 * Whether a meal the server just saved is on the day the screen re-read
 * (TEC-113).
 *
 * A save that does not render looks exactly like a save that failed, and the
 * only thing a person can do about that is log it again — which is how a day
 * gets counted twice. So after a save the screen checks for the entry it was
 * handed back, and anything but "it is there" is said in words.
 *
 * Pure, so the rule is tested rather than the component.
 */

export type SavedEntry = { id: string; eaten_on: string };

/** Null when the saved entry is on the day shown; otherwise what to tell you. */
export function savedButNotShown(
  saved: SavedEntry,
  day: { date: string; entries: { id: string }[] } | null,
  readError: string | null = null
): string | null {
  // Filed under the day it was dictated, which is not the day on screen — a
  // draft started before midnight and approved after it. Not a failure, but
  // it would otherwise vanish without a word.
  if (day && saved.eaten_on !== day.date) {
    return `Logged to ${saved.eaten_on}, the day it was dictated — not today, so it isn't in the list below.`;
  }
  if (!day || readError) {
    return `Logged, but today couldn't be read back${readError ? ` (${readError})` : ""}. Reload before logging it again.`;
  }
  if (!day.entries.some((e) => e.id === saved.id)) {
    return "Logged, but today's list came back without it. Reload before logging it again.";
  }
  return null;
}
