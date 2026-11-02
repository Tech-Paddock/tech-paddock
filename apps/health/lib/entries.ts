import { getServiceClient } from "./supabase";
import { LookupError } from "./items";

/**
 * Deleting a logged meal (TEC-53, soft since TEC-165). Database only — no model.
 *
 * **It hides the entry and removes nothing.** The route sets `deleted_at`;
 * the entry, its lines, the foods and their versions all stay, and every read
 * of the log (`readDay`) skips a row where it is set. Nothing here can bring
 * one back: that is a hand edit in the database.
 *
 * Kept apart from `lib/log.ts` on purpose: that file reaches the model for the
 * lookup order, and this one must not be able to.
 */

/**
 * True when the entry was in the log and is now hidden; false when there was
 * none, or it was already deleted (so a second tap reads "not in your log").
 * A failed update throws.
 */
export async function deleteEntry(id: string): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from("entries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");

  if (error) throw new LookupError(`Couldn't delete that meal: ${error.message}`);
  return (data ?? []).length > 0;
}
