import { getServiceClient } from "./supabase";
import type { Guide } from "./guide";

/**
 * The bag you bought last time, if this is a repeat purchase. Matched on
 * (roaster, coffee_name) case-insensitively, most recent first — roasters
 * re-release the same coffee with each new crop, and each purchase is its own
 * row, so "have I had this before" is a lookup rather than a uniqueness
 * constraint.
 */
export async function findPreviousBag(roaster: string, coffeeName: string) {
  const { data, error } = await getServiceClient()
    .from("bags")
    .select("id, my_method, my_grinder, my_grind_setting, created_at")
    .ilike("roaster", roaster)
    .ilike("coffee_name", coffeeName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // "No previous purchase" and "the lookup failed" are both a null row, and
  // only one of them is an answer. Swallowing the error made an unreachable
  // database look like a first-time coffee.
  if (error) throw new LookupError(`Couldn't check for a previous purchase: ${error.message}`);
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
  const { data, error } = await getServiceClient()
    .from("bags")
    .select("product_url, guide_url")
    .ilike("roaster", roaster)
    .not("product_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // A failed lookup is not the same as a roaster we have never seen. Both
  // leave the search unpinned, but the second is the documented first-search
  // behaviour and the first is a broken database worth stopping for.
  if (error) throw new LookupError(`Couldn't look up a verified domain for ${roaster}: ${error.message}`);

  return hostOf(data?.product_url) ?? hostOf(data?.guide_url);
}

/** A library lookup that could not be answered, as against one that answered "no". */
export class LookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LookupError";
  }
}

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * A validated guide as bag columns. Shared by the save path and the search
 * path because both write it, and two copies of this mapping would drift the
 * moment a guide field is added — the stored quotes would still be right and
 * the parsed values silently would not.
 */
export function guideColumns(guide: Guide | null, model: string | null = null) {
  const answered = !!guide && guide.status !== "not_searched";
  return {
    product_url: guide?.product_url ?? null,
    guide_url: guide?.guide_url ?? null,
    guide_status: guide?.status ?? "not_searched",
    guide_method: guide?.method ?? null,
    guide_ratio: guide?.params.ratio ?? null,
    guide_dose: guide?.params.dose ?? null,
    guide_water: guide?.params.water ?? null,
    guide_temp: guide?.params.temp ?? null,
    guide_grind: guide?.params.grind ?? null,
    guide_time: guide?.params.time ?? null,
    guide_quotes: guide?.quotes ?? [],
    // Stored, not just returned. A value the model could not back belongs
    // beside what was kept, and the search no longer hands this to the page.
    guide_dropped: guide?.dropped ?? [],
    guide_fetched_at: answered ? new Date().toISOString() : null,
    // Which model answered, recorded only when one did. A guide is comparable
    // against another guide only if you know what produced it.
    guide_model: answered ? model : null,
  };
}
