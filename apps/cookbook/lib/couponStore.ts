import { getServiceClient } from "./supabase";
import { LookupError } from "./errors";
import type { Coupon } from "./couponRules";
import { parseCoupons, summary, toRows, weekSeen, type ImportResult } from "./coupons";

/**
 * `cookbook.coupons` (TEC-132; reasoning in the `cookbook_coupons`
 * migration). Read by the Deals tab; written only by `importCoupons` (TEC-230,
 * the owner's Chrome task pasting into Your brands), **insert only**: a
 * conflict on (week_seen, title, amount) is ignored, so a re-paste adds
 * nothing. Until a row exists the Deals tab says "no coupons staged yet". What
 * counts as active is `lib/couponRules.ts`.
 */

/**
 * Every coupon staged recently, and whether **any coupon has ever been
 * staged**: the tab says "no coupons staged yet" only for the second. A failed
 * read throws, so it can never read as "none staged".
 */
export async function readCoupons(): Promise<{ coupons: Coupon[]; staged: boolean }> {
  const { data, error } = await getServiceClient()
    .from("coupons")
    .select("id, title, amount, expires_on, week_seen, product_ids")
    .order("week_seen", { ascending: false })
    .limit(500);
  if (error) throw new LookupError(`Couldn't read the staged coupons: ${error.message}`);
  const coupons = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    title: String(r.title),
    amount: String(r.amount),
    expires_on: typeof r.expires_on === "string" ? r.expires_on : null,
    week_seen: String(r.week_seen),
    product_ids: Array.isArray(r.product_ids) ? (r.product_ids as string[]) : [],
  }));
  return { coupons, staged: coupons.length > 0 };
}

const CHUNK = 500;

/** Write a pasted batch with `week_seen` = this week's Monday in Denver. Append only. */
export async function importCoupons(pasted: string, now: Date = new Date()): Promise<ImportResult> {
  const { lines, skipped, droppedCodes } = parseCoupons(pasted);
  const rows = toRows(lines, weekSeen(now));
  if (rows.length === 0) return summary(0, 0, skipped, droppedCodes);

  let imported = 0;
  let withCodes = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { data, error } = await getServiceClient()
      .from("coupons")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "week_seen,title,amount", ignoreDuplicates: true })
      .select("product_ids");
    if (error) throw new LookupError(`Couldn't save the coupons: ${error.message}`);
    const added = (data ?? []) as { product_ids: string[] | null }[];
    imported += added.length;
    withCodes += added.filter((r) => Array.isArray(r.product_ids) && r.product_ids.length > 0).length;
  }
  return summary(imported, withCodes, skipped, droppedCodes);
}
