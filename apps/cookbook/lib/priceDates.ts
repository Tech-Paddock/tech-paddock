/**
 * Dates for the nightly price scan (TEC-132), as `YYYY-MM-DD` strings.
 *
 * **No imports**, because the browser runs it too. A night is the **Denver
 * calendar date** of the run, never the server's: Vercel Cron fires at a fixed
 * UTC hour (09:00), which is 03:00 Denver in daylight time and 02:00 in
 * standard time, so it always lands on the same Denver date and the date only
 * has to be read in the right zone. The week is Monday to Sunday.
 */

export const PRICE_TZ = "America/Denver";

const DAY_MS = 24 * 60 * 60 * 1000;

const asUtc = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** The Denver calendar date at this instant. */
export function denverDate(now: Date): string {
  // en-CA writes year-month-day, which is the format wanted.
  return new Intl.DateTimeFormat("en-CA", { timeZone: PRICE_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(date: string, days: number): string {
  return new Date(asUtc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: string): number {
  return new Date(asUtc(date)).getUTCDay() || 7;
}

/** The Monday on or before the date. */
export function mondayOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/**
 * The Monday of the week to roll up when the run is on this date, or null when
 * it is not a Monday. **Only Mondays roll up**, and the week is the one that
 * just ended: Monday to Sunday, seven days back.
 */
export function weekToRollUp(runDate: string): string | null {
  return isoWeekday(runDate) === 1 ? addDays(runDate, -7) : null;
}
