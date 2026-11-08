/**
 * The book's order (TEC-224, then TEC-235): **always A to Z by recipe name, with
 * no choice offered.** Pure.
 *
 * A to Z ignores case and accents, ignores a leading "The" ("The Best Chili"
 * files under B), and compares with `localeCompare`. Two names that compare
 * equal keep the order they came in (`Array.prototype.sort` is stable), so a
 * tie never shuffles.
 */

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

/** The recipes A to Z. Returns a new array and never mutates the input. */
export function sortRecipes<T extends { name: string }>(recipes: readonly T[]): T[] {
  return [...recipes].sort((x, y) => compareNames(x.name, y.name));
}
