import type { Decision } from "./brands";
import { lineTerm, type Plan } from "./cart";
import { pickerOptions, type PickerOption } from "./cartGuess";
import { searchFor } from "./grocery";
import { isKingSoopersProduct, pageFor } from "./kingsoopers";

/**
 * **The popup behind a grocery item's name** (TEC-226; owner, 2026-11-04: "I want it to pop
 * up a window like the search function for everything"). Tapping a name no longer follows a
 * link to a search in the browser: it opens the matching King Soopers products, and a tap on
 * one opens that product's page, which a phone hands to the King Soopers app.
 *
 * **Pure; the server and the browser both run it.** It reads the candidates `pickerOptions`
 * builds (the picker's own data) and only orders and words them. **Browsing never adds to the
 * cart and never changes a default**: every option is a link, nothing here posts.
 */

export type MatchOption = {
  upc: string;
  /** A King Soopers product page (`/p/...`), always. */
  href: string;
  label: string;
  detail: string;
  /** "★ bought 3×", "Kroger's pick" or "new" (see `optionTag`). */
  tag: string;
  isDefault: boolean;
};

export type MatchView = {
  options: MatchOption[];
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
      href: pageOf(o),
      label: o.label,
      detail: o.detail,
      tag: optionTag(o),
      isDefault: o.isDefault,
    }));
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
export function matchView(plan: Plan, searchHref: string, reach: Reach): MatchView {
  const options = matchOptions(plan);
  if (!reach.ok) return { options, searchHref, note: reach.why };
  if (options.length > 0) return { options, searchHref, note: null };
  return { options, searchHref, note: plan.kind === "none" ? plan.reason : "No matches at your store." };
}
