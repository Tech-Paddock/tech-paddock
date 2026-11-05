import { candidateOf, type Candidate, type Decision, type SavedProduct } from "./brands";
import { isKingSoopersProduct, pageFor, productIdFromUrl } from "./kingsoopers";

/**
 * **A product picked for one grocery line** (TEC-227; owner, 2026-11-04: "This line only").
 *
 * Tapping a product in the List popup stores it on that line (`grocery_items.picked_product`).
 * It is the **named product** step: ahead of the name's default, the pack that fits and the most
 * purchased, in `planLine` (`lib/cart.ts`) and in the list's own pricing. **A pick never writes
 * `default_for`** and never saves a name to Your brands; only Send remembers what went in, as it
 * always has.
 *
 * Pure, with nothing that reaches a database, so the browser can read it too.
 */

export type PickedProduct = {
  upc: string;
  /** A King Soopers product page carrying `upc`. */
  url: string;
  label: string;
  size: string | null;
  price: number | null;
};

const UPC = /^\d{8,14}$/;

/** A pick from a request body or a database row, or null for anything that is not one. Never throws. */
export function readPicked(raw: unknown): PickedProduct | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const upc = typeof o.upc === "string" ? o.upc.trim() : "";
  if (!UPC.test(upc)) return null;
  const label = typeof o.label === "string" ? o.label.trim().slice(0, 200) : "";
  const size = typeof o.size === "string" && o.size.trim() ? o.size.trim().slice(0, 60) : null;
  const price = typeof o.price === "number" && Number.isFinite(o.price) && o.price >= 0 ? o.price : null;
  const given = typeof o.url === "string" ? o.url.trim() : "";
  // The page must be King Soopers' and carry this very code; anything else is rebuilt from the code.
  const url = isKingSoopersProduct(given) && productIdFromUrl(given) === upc ? given : pageFor(upc, label || upc);
  return { upc, url, label: label || `Product ${upc}`, size, price };
}

/** The candidate a pick stands for: the saved product when Your brands has it, else the snapshot. */
export function pickedCandidate(picked: PickedProduct, products: SavedProduct[]): Candidate {
  const saved = products.find((p) => p.product_id === picked.upc);
  if (saved) return { ...candidateOf(saved), isDefault: false };
  return {
    id: null,
    upc: picked.upc,
    url: picked.url,
    count: 0,
    missing: false,
    description: picked.label,
    size: picked.size,
    sizeFirst: null,
    price: picked.price,
    names: [],
  };
}

/** What a picked line is decided as: that one product, named. */
export function pickedDecision(name: string, picked: PickedProduct, products: SavedProduct[]): Decision {
  return { kind: "products", via: "name", name, matched: null, chosen: "named", candidates: [pickedCandidate(picked, products)] };
}

/**
 * `decider` that also takes a line's pick, **first** (the named-product step). Without a pick it is
 * `decider` exactly. The pick is the third argument, so the two-argument deciders still fit.
 */
export function withPicks(
  decide: (name: string, note?: string | null) => Decision,
  products: SavedProduct[]
): (name: string, note?: string | null, picked?: PickedProduct | null) => Decision {
  return (name, note = null, picked = null) => (picked ? pickedDecision(name, picked, products) : decide(name, note));
}
