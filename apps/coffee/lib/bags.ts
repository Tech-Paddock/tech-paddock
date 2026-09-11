import { getServiceClient } from "./supabase";

/**
 * The bag you bought last time, if this is a repeat purchase. Matched on
 * (roaster, coffee_name) case-insensitively, most recent first — roasters
 * re-release the same coffee with each new crop, and each purchase is its own
 * row, so "have I had this before" is a lookup rather than a uniqueness
 * constraint.
 */
export async function findPreviousBag(roaster: string, coffeeName: string) {
  const { data } = await getServiceClient()
    .from("bags")
    .select("id, my_method, my_grinder, my_grind_setting, created_at")
    .ilike("roaster", roaster)
    .ilike("coffee_name", coffeeName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  // Only the dial-in carries over. A rating or tasting note describes a lot
  // you have actually drunk, and this bag is not that lot.
  if (!data.my_method && !data.my_grinder && !data.my_grind_setting) return null;
  return data;
}

/**
 * The roaster's own hostname, learned from a product URL a previous search
 * verified. This is what lets the second and later searches for a roaster pin
 * `allowed_domains` up front instead of leaning on the post-hoc host check in
 * validateGuide. The first search for a roaster we have never seen stays
 * unpinned — there is nothing to pin it to yet, and guessing a domain from the
 * roaster's name is exactly the kind of invention this tool refuses.
 */
export async function findRoasterDomain(roaster: string): Promise<string | null> {
  const { data } = await getServiceClient()
    .from("bags")
    .select("product_url, guide_url")
    .ilike("roaster", roaster)
    .not("product_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return hostOf(data?.product_url) ?? hostOf(data?.guide_url);
}

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}
