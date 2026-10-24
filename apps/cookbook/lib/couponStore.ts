import { getServiceClient } from "./supabase";
import { LookupError } from "./errors";
import type { Coupon } from "./couponRules";

/**
 * `cookbook.coupons` (TEC-132; reasoning in the `cookbook_coupons`
 * migration). **The read path only**: the weekly Chrome task (TEC-126) and its
 * paste-and-review flow come later and will write here. Nothing in this app
 * inserts a coupon yet, so the table is empty and the Deals tab says "no
 * coupons staged yet". What counts as active is `lib/couponRules.ts`.
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
