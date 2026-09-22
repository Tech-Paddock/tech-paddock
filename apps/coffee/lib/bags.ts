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
  const supabase = getServiceClient();

  const { data: bag, error } = await supabase
    .from("bags")
    .select("id, created_at")
    .ilike("roaster", roaster)
    .ilike("coffee_name", coffeeName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // "No previous purchase" and "the lookup failed" are both a null row, and
  // only one of them is an answer. Swallowing the error made an unreachable
  // database look like a first-time coffee.
  if (error) throw new LookupError(`Couldn't check for a previous purchase: ${error.message}`);
  if (!bag) return null;

  // The dial-in lives on brews now, so the thing worth carrying forward is the
  // last brew of that bag rather than anything on the bag itself.
  const { data: brew, error: brewError } = await supabase
    .from("brews")
    .select("brewer, brew_method, grinder, grind_setting")
    .eq("bag_id", bag.id)
    .order("brewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (brewError) throw new LookupError(`Couldn't read the last brew of that bag: ${brewError.message}`);
  if (!brew) return null;
  if (!brew.brewer && !brew.brew_method && !brew.grinder && !brew.grind_setting) return null;

  // A rating or a tasting note describes a lot you actually drank, and this
  // bag is not that lot. Only the dial-in carries.
  return { id: bag.id, created_at: bag.created_at, ...brew };
}

/** A library lookup that could not be answered, as against one that answered "no". */
export class LookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LookupError";
  }
}

/**
 * A URL's hostname, `www.` stripped and lowercased, or null if it is not a
 * URL at all. Used to tell a stored product link that can be handed to the
 * model from a string that only looks like one.
 */
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
export function guideColumns(guide: Guide | null, model: string | null = null, effort: string | null = null) {
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
    // What answered, recorded only when something did. A guide is comparable
    // against another guide only if you know what produced it, and the effort
    // level is as much a part of that as the model.
    guide_model: answered ? model : null,
    guide_effort: answered ? effort : null,
  };
}

/**
 * A library search term as a PostgREST `ilike` pattern.
 *
 * The term goes into an `or=(...)` filter, where a comma separates terms and
 * parentheses group them. So an unescaped comma in "Sweet Bloom, Colombia"
 * does not search for a comma — it produces a malformed filter, a Postgres
 * error, and a 500 on a query that looks perfectly reasonable to type.
 *
 * The fix is PostgREST's own: wrap the value in double quotes, which makes its
 * delimiters ordinary characters, and escape what quoting cannot cover.
 */
export function searchPattern(q: string): string {
  const escaped = q
    // Backslash first, or it doubles the escapes added below.
    .replace(/\\/g, "\\\\")
    // Would otherwise close the quoted value early.
    .replace(/"/g, '\\"')
    // % and _ are LIKE wildcards; PostgREST maps * onto % as well.
    .replace(/[%_*]/g, (m) => `\\${m}`);
  return `"%${escaped}%"`;
}
