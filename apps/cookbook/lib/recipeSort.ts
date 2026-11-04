/**
 * The book's sort (TEC-224). Two choices: the book's own order (the default,
 * whatever the server returns) or A to Z by recipe name. Pure; the component owns
 * storage and the select.
 *
 * A to Z ignores case and accents, ignores a leading "The" ("The Best Chili"
 * files under B), and compares with `localeCompare`. Two names that compare
 * equal keep the order they came in (`Array.prototype.sort` is stable), so a
 * tie never shuffles.
 */

export type BookSort = "default" | "az";

export const DEFAULT_SORT: BookSort = "default";

export const SORT_CHOICES: readonly { value: BookSort; label: string }[] = [
  { value: "default", label: "Book order" },
  { value: "az", label: "A to Z" },
];

/** A stored or typed value back to a sort. Anything not on the list is the default. */
export function readSort(raw: unknown): BookSort {
  return raw === "az" ? "az" : DEFAULT_SORT;
}

/** The name as it files: trimmed, and without a leading "The " (any case). A bare "The" stays. */
export function sortKey(name: string): string {
  const trimmed = name.trim();
  const rest = trimmed.replace(/^the\s+/i, "");
  return rest === "" ? trimmed : rest;
}

/** Compare two recipe names for A to Z. */
export function compareNames(a: string, b: string): number {
  return sortKey(a).localeCompare(sortKey(b), "en", { sensitivity: "base" });
}

/** The recipes in the chosen order. Returns a new array and never mutates the input. */
export function sortRecipes<T extends { name: string }>(recipes: readonly T[], sort: BookSort): T[] {
  const copy = [...recipes];
  if (sort === "az") copy.sort((x, y) => compareNames(x.name, y.name));
  return copy;
}
