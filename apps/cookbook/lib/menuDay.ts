/**
 * The day a menu entry is planned for (Joel, 2026-10-05). Pure, so the browser
 * can import it: `lib/menu.ts` reads the database, and a client component that
 * imported it would pull `supabase.ts` in after it.
 *
 * **A day is a `YYYY-MM-DD` string, never a `Date`.** A `Date` is a moment, and
 * turning "2026-10-07" into one at UTC midnight shows it as the 6th anywhere
 * west of Greenwich — Denver included. So the string is what is stored, sent
 * and compared, and only `menuDayLabel` ever builds a `Date`, at local noon.
 */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day in `YYYY-MM-DD`, or null. "2026-02-30" is not one. */
export function parseDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = DAY.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return value.trim();
}

/** Today where this code runs, as `YYYY-MM-DD`. In the browser that is where Joel is. */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "Tue 10/7" — Joel's format for a menu row. */
export function menuDayLabel(day: string): string {
  const m = DAY.exec(day);
  if (!m) return day;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  return `${weekday} ${Number(m[2])}/${Number(m[3])}`;
}
