import { denverDate, mondayOf } from "./priceDates";

/**
 * Import coupons (TEC-230): the pure half. A paste is one JSON object per line;
 * **a bad line is counted and skipped, never guessed**. A `product_ids` entry
 * that is not 8 to 14 digits is dropped and counted; its coupon is still kept.
 * Format and sample: NOTES.md, *Import coupons*.
 */

export type CouponLine = {
  title: string;
  amount: string;
  expires_on: string | null;
  product_ids: string[];
};

export type CouponRow = CouponLine & { week_seen: string };

export type ReadCoupons = { lines: CouponLine[]; skipped: number; droppedCodes: number };

const MAX_TITLE = 300;
const MAX_AMOUNT = 200;
const MAX_CODES = 200;

/** Trimmed text with runs of space collapsed; null when it is absent, empty, too long or not text. */
function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t === "" || t.length > max ? null : t;
}

function realDate(s: unknown): string | null {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

/** One line, or null when it is not a coupon this app can trust. */
export function readLine(raw: unknown): { line: CouponLine; droppedCodes: number } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const title = text(o.title, MAX_TITLE);
  const amount = text(o.amount, MAX_AMOUNT);
  if (!title || !amount) return null;

  let expires_on: string | null = null;
  if (o.expires_on !== undefined && o.expires_on !== null && o.expires_on !== "") {
    expires_on = realDate(o.expires_on);
    if (!expires_on) return null;
  }

  const codes: string[] = [];
  let droppedCodes = 0;
  if (o.product_ids !== undefined && o.product_ids !== null) {
    if (!Array.isArray(o.product_ids)) return null;
    for (const c of o.product_ids.slice(0, MAX_CODES)) {
      if (typeof c === "string" && /^\d{8,14}$/.test(c)) {
        if (!codes.includes(c)) codes.push(c);
      } else droppedCodes++;
    }
    droppedCodes += Math.max(0, o.product_ids.length - MAX_CODES);
  }
  return { line: { title, amount, expires_on, product_ids: codes }, droppedCodes };
}

/** The pasted text: one JSON object per line. Blank lines are not lines. */
export function parseCoupons(pasted: string): ReadCoupons {
  const lines: CouponLine[] = [];
  let skipped = 0;
  let droppedCodes = 0;
  for (const row of pasted.split(/\r?\n/)) {
    if (row.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row);
    } catch {
      skipped++;
      continue;
    }
    const read = readLine(parsed);
    if (read) {
      lines.push(read.line);
      droppedCodes += read.droppedCodes;
    } else skipped++;
  }
  return { lines, skipped, droppedCodes };
}

/** This week's Monday in Denver: the `week_seen` of everything pasted now. */
export function weekSeen(now: Date = new Date()): string {
  return mondayOf(denverDate(now));
}

/**
 * Rows to write. The table is unique on (week_seen, title, amount), so the
 * same coupon twice in one paste is one row (the first wins); a paste is never
 * allowed to say the same key twice.
 */
export function toRows(lines: CouponLine[], week: string): CouponRow[] {
  const seen = new Set<string>();
  const out: CouponRow[] = [];
  for (const l of lines) {
    const k = `${l.title}\u0000${l.amount}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...l, week_seen: week });
  }
  return out;
}

export type ImportResult = { imported: number; withCodes: number; skipped: number; droppedCodes: number; line: string };

/** "Imported N coupons · K with product codes · J skipped". N and K count what was new. */
export function summary(imported: number, withCodes: number, skipped: number, droppedCodes = 0): ImportResult {
  const line = `Imported ${imported} coupon${imported === 1 ? "" : "s"} · ${withCodes} with product codes · ${skipped} skipped`;
  return { imported, withCodes, skipped, droppedCodes, line };
}
