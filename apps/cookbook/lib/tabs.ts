/**
 * The tabs and their addresses. No React, so the tests can hold the one
 * address another app depends on.
 *
 * **`/list` is load-bearing.** Health's `/list` redirects to
 * `https://cookbook.techpaddock.io/list` while the grocery list moves here
 * (TEC-15), so renaming it breaks a redirect in an app this one cannot see.
 *
 * **Add is a tab of its own** (2026-10-05). **Your brands** (TEC-131) lives at
 * `/brands`, **Deals** (TEC-132) at `/deals`. **The order is Recipes · Grocery
 * list · Deals · Add · Your brands** (TEC-189, 2026-10-29), and the list tab is
 * now called **Grocery list** (the owner's call; it was "King Soopers list").
 * Its path stays `/list`. Still one verb each: browse, shop, save, add,
 * remember.
 */

export type Tab = "recipes" | "add" | "shop" | "brands" | "deals";

export const TABS: { id: Tab; label: string; path: string }[] = [
  { id: "recipes", label: "Recipes", path: "/" },
  { id: "shop", label: "Grocery list", path: "/list" },
  { id: "deals", label: "Deals", path: "/deals" },
  { id: "add", label: "Add", path: "/add" },
  { id: "brands", label: "Your brands", path: "/brands" },
];

export function pathFor(tab: Tab): string {
  return TABS.find((t) => t.id === tab)?.path ?? "/";
}
