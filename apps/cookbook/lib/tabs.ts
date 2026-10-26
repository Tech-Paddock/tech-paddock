/**
 * The tabs and their addresses. No React, so the tests can hold the one
 * address another app depends on.
 *
 * **`/list` is load-bearing.** Health's `/list` redirects to
 * `https://cookbook.techpaddock.io/list` while the grocery list moves here
 * (TEC-15), so renaming it breaks a redirect in an app this one cannot see.
 *
 * **Add is a tab of its own** (2026-10-05, replacing the two-tab index
 * of 2026-09-24). **Your brands is the fourth** (TEC-131, 2026-10-22), after
 * the list, at `/brands`. **Deals is the fifth** (TEC-132, 2026-10-24), after
 * Your brands, at `/deals`. Still one verb each: browse, add, shop, remember,
 * save.
 */

export type Tab = "recipes" | "add" | "shop" | "brands" | "deals";

export const TABS: { id: Tab; label: string; path: string }[] = [
  { id: "recipes", label: "Recipes", path: "/" },
  { id: "add", label: "Add", path: "/add" },
  // Named for where it actually goes. Every link on it is a King Soopers search,
  // so "Shopping list" was one word vaguer than the thing deserves.
  { id: "shop", label: "King Soopers list", path: "/list" },
  { id: "brands", label: "Your brands", path: "/brands" },
  { id: "deals", label: "Deals", path: "/deals" },
];

export function pathFor(tab: Tab): string {
  return TABS.find((t) => t.id === tab)?.path ?? "/";
}
