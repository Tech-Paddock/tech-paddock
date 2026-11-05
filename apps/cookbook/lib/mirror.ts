import { planLine, type CartLine, type LineDecider, type Plan } from "./cart";
import type { Product } from "./kroger";
import type { MirrorRow } from "./mirrorWords";

/**
 * **In cart mirrors the List** (TEC-227; owner, 2026-11-04: "With the list conversion shopping
 * list creates a mirror grayed out item in cart. Adding it one off or the entire list switches
 * them to live.").
 *
 * Every unsent List line shows In cart as a greyed-out row: the exact product it would send now,
 * by **the same picking as a send** (`planLine`: your pick, the name's default, the pack that
 * fits, the most bought, else Kroger's top match). **Pure, with Kroger passed in**, so each rule
 * here is tested without it. Nothing here writes: no cart add, no default, no product.
 *
 * Three states, and only these:
 * - `product`: the product a send would put in the cart.
 * - `pick-one`: no clear match (Kroger has none, or several saved products and nothing separates
 *   them). The row reads "<word> — pick one", and tapping the List row opens the popup.
 * - `unknown`: it could not be worked out (Kroger could not be asked). The row reads the plain
 *   word. **A failure degrades to the word and never blocks the list.**
 */

export type { MirrorRow };
export { greyTotal, greyWords, productWords } from "./mirrorWords";

export { MIRROR_MAX } from "./mirrorLimit";

/** How many Kroger searches run at once (as `reviewLines` does). */
const PARALLEL = 4;

/** The product a plan sends, or null when there is no clear match. */
export function mirrorOf(id: string, plan: Plan): MirrorRow {
  if (plan.kind === "exact") {
    const o = plan.option;
    return { id, state: "product", upc: plan.upc, label: o.description ?? o.names[0] ?? `Product ${plan.upc}`, size: o.size, price: o.price };
  }
  if (plan.kind === "match") {
    const p = plan.product;
    return { id, state: "product", upc: p.upc, label: p.description, size: p.size, price: p.price };
  }
  // Several saved products with nothing to separate them, or nothing at all: no clear match.
  return { id, state: "pick-one" };
}

/**
 * Each line's mirror row. `search` is null when Kroger cannot be asked (not connected, no store):
 * a line that only a Kroger search could settle then reads `unknown`, while a line Your brands
 * settles (a pick, a default, the only saved product, the pack that fits) still resolves.
 */
export async function mirrorLines(
  lines: CartLine[],
  decide: LineDecider,
  search: ((term: string) => Promise<Product[]>) | null
): Promise<MirrorRow[]> {
  const out: MirrorRow[] = new Array(lines.length);
  let next = 0;
  async function worker() {
    while (next < lines.length) {
      const i = next++;
      const line = lines[i];
      let asked = false;
      let failed = false;
      const plan = await planLine(line, decide, async (term) => {
        asked = true;
        if (!search) {
          failed = true;
          throw new Error("King Soopers could not be asked.");
        }
        try {
          return await search(term);
        } catch (e) {
          failed = true;
          throw e;
        }
      });
      // A search that failed is "unknown", not "no match": the word stays, and nothing is blocked.
      out[i] = asked && failed && plan.kind === "none" ? { id: line.id, state: "unknown" } : mirrorOf(line.id, plan);
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, lines.length) }, worker));
  return out;
}
