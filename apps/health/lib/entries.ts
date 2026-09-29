import { getServiceClient } from "./supabase";
import { LookupError } from "./items";

/**
 * Deleting a logged meal (TEC-53). Database only — no model.
 *
 * **It drops the entry and its lines, and never the food.** `entry_items`
 * references `entries` with `on delete cascade`, so the lines go with it; it
 * references `items` and `item_versions` without one, so a mis-logged lunch
 * does not throw away numbers you approved. Nothing here touches either table.
 *
 * Kept apart from `lib/log.ts` on purpose: that file reaches the model for the
 * lookup order, and this one must not be able to.
 */

/** True when the entry existed and is gone; false when there was none. A failed delete throws. */
export async function deleteEntry(id: string): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from("entries")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) throw new LookupError(`Couldn't delete that meal: ${error.message}`);
  return (data ?? []).length > 0;
}
