import type { Decision } from "./brands";
import { lineTerm, type Plan } from "./cart";
import { pickerOptions, type PickerOption } from "./cartGuess";
import { searchFor } from "./grocery";
import { isKingSoopersProduct, pageFor } from "./kingsoopers";
import type { PickedProduct } from "./linePick";

/**
 * **The popup behind a grocery item's name** (TEC-226; owner, 2026-11-04: "I want it to pop
 * up a window like the search function for everything"). Tapping a name opens the matching
 * King Soopers products.
 *
 * **TEC-227 (owner, 2026-11-04: "tapping the item should select confirm it in the list"):** a tap
 * on a product **picks it for that line**, and + Cart and Send all then send it. It is not made
 * a default ("This line only"); the popup itself adds nothing to the cart.
 *
 * **Pure; the server and the browser both run it.** It reads the candidates `pickerOptions`
 * builds (the picker's own data) and only orders and words them.
 */

export type MatchOption = {
  upc: string;
  /** A King Soopers product page (`/p/...`), always. Sent with a pick so Send can remember it. */
  url: string;
  label: string;
  size: string | null;
  price: number | null;
  /** "12 oz · $1.99": the facts after the name on its one line. */
  detail: string;
  /** "★ bought 3×", "Kroger's pick" or "new" (see `optionTag`); "your pick" for a pick the plan no longer offers. */
  tag: string;
  isDefault: boolean;
  /** This is the product picked for the line (TEC-227). */
  selected: boolean;
};

export type MatchView = {
  options: MatchOption[];
  /** The code of the product picked for this line, or null (TEC-227). */
  picked: string | null;
  /** The fallback: King Soopers' search for this line. Always present. */
  searchHref: string;
  /** Why the list is short or empty, or null when there is nothing to explain. */
  note: string | null;
};

export type Reach = { ok: true } | { ok: false; why: string };

/** The right-hand word on an option: the default's star, Kroger's pick, bought-N× or new. Shared with the Which-chicken picker. */
export function optionTag(o: Pick<PickerOption, "isDefault" | "fresh" | "count">): string {
  return `${o.isDefault ? "★ " : ""}${o.fresh ? "Kroger's pick" : o.count > 0 ? `bought ${o.count}×` : "new"}`;
}

/** A /p/ page for the option: its own when it is one, else built from the code. */
function pageOf(o: PickerOption): string {
  return isKingSoopersProduct(o.url) ? o.url : pageFor(o.upc, o.label);
}

/**
 * The products to list, in order: the default first, then the most bought, then the order the
 * plan gave (which is already best-first). One row per product code.
 */
export function matchOptions(plan: Plan): MatchOption[] {
  const seen = new Set<string>();
  return pickerOptions(plan)
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => {
      if (seen.has(o.upc)) return false;
      seen.add(o.upc);
      return true;
    })
    .sort((a, b) => Number(b.o.isDefault) - Number(a.o.isDefault) || b.o.count - a.o.count || a.i - b.i)
    .map(({ o }) => ({
      upc: o.upc,
      url: pageOf(o),
      label: o.label,
      size: o.size,
      price: o.price,
      detail: o.detail,
      tag: optionTag(o),
      isDefault: o.isDefault,
      selected: false,
    }));
}

/** The facts after a product's name: its size and its price, "12 oz · $1.99". */
export function factsOf(size: string | null, price: number | null): string {
  return [size, price === null ? null : `$${price.toFixed(2)}`].filter(Boolean).join(" · ");
}

/**
 * Mark the picked product (TEC-227). A pick the plan no longer offers (Kroger's top match moved,
 * or the store changed) still shows, first, tagged "your pick", so what the line will send is
 * never hidden.
 */
function withPick(options: MatchOption[], picked: PickedProduct | null): MatchOption[] {
  if (!picked) return options;
  if (options.some((o) => o.upc === picked.upc)) return options.map((o) => (o.upc === picked.upc ? { ...o, selected: true } : o));
  const own: MatchOption = {
    upc: picked.upc,
    url: picked.url,
    label: picked.label,
    size: picked.size,
    price: picked.price,
    detail: factsOf(picked.size, picked.price),
    tag: "your pick",
    isDefault: false,
    selected: true,
  };
  return [own, ...options];
}

/** King Soopers' search for a line: a phrase's search words, else the item alone (never the quantity or note). */
export function searchHrefFor(name: string, note: string | null, decision: Decision): string {
  if (decision?.kind === "terms") return searchFor(decision.terms);
  return searchFor(lineTerm(name, note) ?? name);
}

/**
 * What the popup shows for a line. `reach` is not ok when King Soopers could not be asked (not
 * connected, no store, or no answer): then only a saved product can be listed, and `why` says
 * so. Every state keeps the search link.
 */
export function matchView(plan: Plan, searchHref: string, reach: Reach, picked: PickedProduct | null = null): MatchView {
  const options = withPick(matchOptions(plan), picked);
  const base = { options, picked: picked?.upc ?? null, searchHref };
  if (!reach.ok) return { ...base, note: reach.why };
  if (options.length > 0) return { ...base, note: null };
  return { ...base, note: plan.kind === "none" ? plan.reason : "No matches at your store." };
}
