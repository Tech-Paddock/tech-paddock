import type { ScanRecord } from "./pricing";

/**
 * The on-sale tag on a list line (TEC-121, scope 3a): "On sale, 20% off until
 * Oct 27". **Type-only imports**, because the browser runs it and must not pull
 * Kroger's client or the database in with it.
 *
 * **No Kroger call of its own.** The tag is read from prices the list tab
 * already has: the latest deal scan (which checks every open line by name).
 * The live estimate left in TEC-190. Rules:
 *
 * - **A sale is promo below regular, at the chosen store.** A scan from another
 *   store tags nothing.
 * - **A sale whose end date has passed tags nothing.** No end date: the tag
 *   says so by leaving "until" off, rather than guessing one.
 * - **It says sale, never coupon.** Digital coupons are TEC-126; the public API
 *   has none.
 */

export type SaleTag = { percentOff: number; endsAt: string | null };

export type SaleSources = {
  /** The chosen store's location ID; with none, nothing is tagged. */
  locationId: string | null;
  scan: Pick<ScanRecord, "location_id" | "deals"> | null;
};

/** `YYYY-MM-DD` from Kroger's date, read off the string so no time zone moves the day. */
function datePart(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function today(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Ended means the end day is before today; the end day itself still counts. */
function ended(endsAt: string | null, now: Date): boolean {
  if (!endsAt) return false;
  const day = datePart(endsAt);
  return day !== null && day < today(now);
}

/** Each open line's sale, by line ID. A line not in the map is not tagged. */
export function saleTags(lines: { id: string; name: string }[], sources: SaleSources, now: Date = new Date()): Map<string, SaleTag> {
  const tags = new Map<string, SaleTag>();
  if (!sources.locationId) return tags;

  const byName = new Map<string, SaleTag>();
  if (sources.scan && sources.scan.location_id === sources.locationId) {
    for (const d of sources.scan.deals) {
      if (!(d.promo < d.regular)) continue;
      for (const name of d.for) {
        const key = name.trim().toLowerCase();
        const had = byName.get(key);
        if (!had || d.percentOff > had.percentOff) byName.set(key, { percentOff: d.percentOff, endsAt: d.endsAt });
      }
    }
  }

  for (const line of lines) {
    const tag = byName.get(line.name.trim().toLowerCase()) ?? null;
    if (tag && !ended(tag.endsAt, now)) tags.set(line.id, tag);
  }
  return tags;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "On sale, 20% off until Oct 27", or without "until" when Kroger gave no end date. */
export function saleText(tag: SaleTag): string {
  const head = `On sale, ${tag.percentOff}% off`;
  const day = tag.endsAt ? datePart(tag.endsAt) : null;
  if (!day) return head;
  const [, month, date] = day.split("-").map(Number);
  return `${head} until ${MONTHS[month - 1]} ${date}`;
}
