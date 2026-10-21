import { matchPreference, type Preference } from "./preferences";
import type { BrandProduct } from "./krogerStore";
import type { Decision } from "./cart";

/**
 * Which brand decides a line, reduced to what Kroger lookups care about. **One
 * copy** for the cart review, the estimate and the deal scan (TEC-121), so a
 * line is priced as exactly what Send would put in the cart.
 */
export function decider(preferences: Preference[], products: Pick<BrandProduct, "preference_id" | "missing_since">[]) {
  const missing = new Set(products.filter((p) => p.missing_since).map((p) => p.preference_id));
  return (name: string): Decision => {
    const p = matchPreference(name, preferences);
    return p ? { phrase: p.phrase, kind: p.kind, url: p.url, terms: p.terms, missing: missing.has(p.id) } : null;
  };
}
