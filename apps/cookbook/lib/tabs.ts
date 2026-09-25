/**
 * The two tabs and their addresses. No React, so the tests can hold the one
 * address another app depends on.
 *
 * **`/list` is load-bearing.** Health's `/list` redirects to
 * `https://cookbook.techpaddock.io/list` while the grocery list moves here
 * (TEC-15), so renaming it breaks a redirect in an app this one cannot see.
 */

export type Tab = "recipes" | "shop";

export const TABS: { id: Tab; label: string; path: string }[] = [
  { id: "recipes", label: "Recipes", path: "/" },
  // Named for where it actually goes. Every link on it is a King Soopers search,
  // so "Shopping list" was one word vaguer than the thing deserves.
  { id: "shop", label: "King Soopers list", path: "/list" },
];

export function pathFor(tab: Tab): string {
  return TABS.find((t) => t.id === tab)?.path ?? "/";
}
