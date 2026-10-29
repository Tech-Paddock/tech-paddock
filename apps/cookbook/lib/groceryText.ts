import type { GroceryItem } from "./grocery";

/**
 * The list helpers the browser runs: **pure, and no imports beyond types**, so a
 * client component can take them without pulling `./supabase` into its bundle.
 * `lib/grocery.ts` re-exports both, so the server side and the tests read them
 * from there as before.
 */

/** The most one line can ask for; the table checks the same range. */
export const MAX_QUANTITY = 99;

/** The open lines as a block you can paste anywhere. Ticked-off lines are not shopping. */
export function asText(items: GroceryItem[]): string {
  const open = items.filter((i) => !i.checked);
  if (open.length === 0) return "";
  return open
    .map((i) => {
      // A quantity of one is the default and says nothing, so it is not printed.
      const name = (i.quantity ?? 1) > 1 ? `${i.name} ×${i.quantity}` : i.name;
      return i.note ? `${name} — ${i.note}` : name;
    })
    .join("\n");
}
