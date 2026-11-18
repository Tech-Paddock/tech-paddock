/**
 * The Microsoft client secret in `tp-grid` (`MS_CLIENT_SECRET`) expires on this
 * day, and Outlook stops syncing the day it does. It is typed here because
 * Microsoft shows the date once, when the secret is made; replacing the secret
 * means changing this line to the new date (apps/grid/NOTES.md says how).
 */
export const SECRET_EXPIRES = "2028-11-16";
export const WARN_DAYS = 30;

const DAY_MS = 86_400_000;

/** Whole days from `now`'s UTC day to the expiry day (negative once past). */
export function daysLeft(now: Date, expires = SECRET_EXPIRES): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((Date.parse(`${expires}T00:00:00Z`) - today) / DAY_MS);
}

/** A sentence to show when the secret is within 30 days of expiring or past it; null otherwise. */
export function secretWarning(now: Date, expires = SECRET_EXPIRES): string | null {
  const n = daysLeft(now, expires);
  if (n < 0) return `The Microsoft secret expired on ${expires}. Outlook is no longer syncing; make a new secret.`;
  if (n <= WARN_DAYS) return `The Microsoft secret expires on ${expires} (${n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`}). Make a new one before then.`;
  return null;
}
