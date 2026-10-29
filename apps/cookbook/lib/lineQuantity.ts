import { decider, type Decision } from "./brands";
import { readProducts } from "./productStore";
import { readPreferences } from "./preferences";
import { lineView, type Pack } from "./lineView";

/**
 * The pack conversion that applies to a line (TEC-131): the saved product
 * that decides it, the top-ranked when several do — the same one the estimate
 * prices. Null when no product decides it.
 */
export function packOf(decision: Decision): Pack | null {
  if (decision?.kind !== "products") return null;
  return decision.candidates[0]?.pack ?? null;
}

/**
 * A function giving each line its cart quantity by the fixed rules
 * (`lib/lineView.ts`), for lines being added or tidied. **Never blocks a
 * write**: if Your brands cannot be read, the rules run without a pack
 * conversion, which is what a line with no saved product gets anyway.
 */
export async function quantityRule(): Promise<(line: { name: string; note: string | null }) => number> {
  let decide: (name: string, note?: string | null) => Decision = () => null;
  try {
    const [products, words] = await Promise.all([readProducts(), readPreferences()]);
    decide = decider(products, words);
  } catch {
    // Counted without conversions; see above.
  }
  return (line) => lineView(line, packOf(decide(line.name, line.note))).quantity;
}
