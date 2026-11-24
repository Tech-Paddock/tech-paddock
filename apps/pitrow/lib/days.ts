/**
 * Calendar days as `YYYY-MM-DD` strings: the person's local day, made by the
 * browser and sent with every request. The server never works out "today" from
 * its own clock (it runs in UTC), so a late-evening tick lands on the day the
 * person is living in.
 */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDay(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = DAY.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** The device's local calendar day. */
export function localDay(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function utc(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(day: string, n: number): string {
  const d = utc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 (Sunday) to 6 (Saturday). */
export function weekdayOf(day: string): number {
  return utc(day).getUTCDay();
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function diffDays(a: string, b: string): number {
  return Math.round((utc(b).getTime() - utc(a).getTime()) / 86400000);
}

/** The Sunday on or before `day`: the first day of its week, matching the 0 = Sunday weekdays. */
export function weekStartOf(day: string): string {
  return addDays(day, -weekdayOf(day));
}

/** The seven days from `start`. */
export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"] as const;
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

function month(day: string): string {
  return utc(day).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

/** "Wed 12 Nov". */
export function shortDay(day: string): string {
  const d = utc(day);
  return `${WEEKDAY_NAMES[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${month(day)}`;
}

/** "Nov 22 – 28", or "Nov 29 – Dec 5" across a month. */
export function weekLabel(start: string): string {
  const end = addDays(start, 6);
  const n = (d: string) => utc(d).getUTCDate();
  return month(start) === month(end) ? `${month(start)} ${n(start)} – ${n(end)}` : `${month(start)} ${n(start)} – ${month(end)} ${n(end)}`;
}
