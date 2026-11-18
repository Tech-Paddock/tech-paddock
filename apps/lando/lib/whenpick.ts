/**
 * The Day and Time pop-ups' pure parts: five-minute steps, the "ago" shortcuts, the month grid, and what a form that
 * can't be in the future (Potty, a note) greys out. A local datetime is `YYYY-MM-DDTHH:mm`, a day `YYYY-MM-DD`; both are
 * the phone's own clock, as in `lib/localtime.ts`. Everything here is pure.
 */
import { toLocalInput } from "./localtime";

/** The minute list steps by this many. */
export const MINUTE_STEP = 5;

const pad = (n: number) => String(n).padStart(2, "0");

/** The same moment rounded down to a five-minute step, seconds dropped: a new entry opens on this. */
export function floorToStep(d: Date): Date {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - (x.getMinutes() % MINUTE_STEP), 0, 0);
  return x;
}

/** A moment as a local datetime, rounded down to a step. */
export const localStep = (d: Date): string => toLocalInput(floorToStep(d).toISOString());

/** The Time pop-up's shortcuts: minutes ago, and their words. Now is the first. */
export const QUICK_AGO: readonly (readonly [number, string])[] = [
  [0, "Now"],
  [15, "15 min ago"],
  [30, "30 min ago"],
  [45, "45 min ago"],
  [60, "1 hr ago"],
];

/** The local datetime `ago` minutes before now, on a five-minute step. */
export function quickValue(ago: number, now: Date): string {
  return localStep(new Date(floorToStep(now).getTime() - ago * 60_000));
}

/**
 * The minute picklist: :00 to :55, plus the value's own minute when it is not on a step (an older entry saved at
 * 9:07 still shows 9:07, never the nearest step), in order.
 */
export function minuteOptions(current: number): number[] {
  const out = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);
  if (Number.isFinite(current) && !out.includes(current)) out.push(current);
  return out.sort((a, b) => a - b);
}

/** A value past `max` becomes `max` on a step (never a step above it); no `max` leaves it. */
export function clampTo(value: string, max: string | undefined): string {
  if (!max || value <= max) return value;
  const d = new Date(max);
  return localStep(Number.isNaN(d.getTime()) ? new Date() : d);
}

/** Hours (12-hour face, with AM or PM) that fall after `max` on `value`'s day: greyed out. */
export function hourDisabled(value: string, max: string | undefined, hour12: number, pm: boolean): boolean {
  if (!max || value.slice(0, 10) < max.slice(0, 10)) return false;
  if (value.slice(0, 10) > max.slice(0, 10)) return true;
  return (hour12 % 12) + (pm ? 12 : 0) > Number(max.slice(11, 13));
}

/** Minutes after `max` within `max`'s own hour on `max`'s own day. */
export function minuteDisabled(value: string, max: string | undefined, minute: number): boolean {
  if (!max || value.slice(0, 10) !== max.slice(0, 10)) return false;
  return Number(value.slice(11, 13)) === Number(max.slice(11, 13)) && minute > Number(max.slice(14, 16));
}

/** PM is greyed out on `max`'s day when `max` is before noon. */
export function pmDisabled(value: string, max: string | undefined): boolean {
  if (!max || value.slice(0, 10) !== max.slice(0, 10)) return false;
  return Number(max.slice(11, 13)) < 12;
}

/** A day after `max`'s day. */
export const dayDisabled = (day: string, max: string | undefined): boolean => !!max && day > max.slice(0, 10);

/** One cell of the month grid: a day, or a blank before the first. */
export type Cell = { day: string; n: number } | null;

/** The month of `year` and 0-based `month` as weeks of cells, Sunday first, blanks before the 1st. */
export function monthCells(year: number, month: number): Cell[] {
  const lead = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  const cells: Cell[] = Array.from({ length: lead }, () => null);
  for (let n = 1; n <= count; n++) cells.push({ day: `${year}-${pad(month + 1)}-${pad(n)}`, n });
  return cells;
}

/** The month a day (`YYYY-MM-DD`) is in, moved by `by` months: `{ year, month }`, month 0-based. */
export function shiftMonth(day: string, by: number): { year: number; month: number } {
  const d = new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1 + by, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}
