import { matchCandidates, type Preference } from "./preferences";
import type { BrandProduct } from "./krogerStore";
import type { Candidate, Decision } from "./cart";

type Known = Pick<BrandProduct, "preference_id" | "missing_since"> &
  Partial<Pick<BrandProduct, "description" | "size" | "price" | "url">>;

/**
 * Which brand decides a line, reduced to what Kroger lookups care about. **One
 * copy** for the cart review, the estimate and the deal scan (TEC-121), so a
 * line is priced as exactly what Send would put in the cart.
 *
 * The decision is the top candidate (most counted); `candidates` carries every
 * product the line matches (TEC-51), which only Send to cart reads: one goes
 * straight in, several are Settle these. The estimate and the deal scan price
 * the top one.
 */
export function decider(preferences: Preference[], products: Known[]) {
  const byId = new Map(products.map((p) => [p.preference_id, p]));
  return (name: string): Decision => {
    const all = matchCandidates(name, preferences);
    const p = all[0];
    if (!p) return null;
    const candidates: Candidate[] = all
      .filter((c) => c.kind === "product" && c.url)
      .map((c) => {
        const known = byId.get(c.id);
        return {
          id: c.id,
          url: c.url as string,
          tally: c.tally ?? 0,
          missing: !!known?.missing_since,
          description: known?.description ?? null,
          size: known?.size ?? null,
          price: known?.price ?? null,
          page: known?.url ?? null,
        };
      });
    return {
      phrase: p.phrase,
      kind: p.kind,
      url: p.url,
      terms: p.terms,
      missing: !!byId.get(p.id)?.missing_since,
      ...(candidates.length > 0 ? { candidates } : {}),
    };
  };
}
