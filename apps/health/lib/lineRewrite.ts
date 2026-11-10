import { getServiceClient } from "./supabase";
import { LookupError } from "./items";
import type { Macros } from "./macros";

/**
 * A correction from today's log updates that one line (owner, 2026-11-09,
 * TEC-69: "update todays line").
 *
 * Kept apart from `lib/entries.ts`, which must never touch `entry_items`.
 */

/**
 * Only a `correction`, only that one line, only when the line is today's (the
 * phone's date, which the correction already carries) and its meal is not
 * deleted. A `change` is never a fix to a line. Any other line is never touched.
 */
export function mayRewriteLine(params: {
  kind: "correction" | "change";
  today: string;
  line: { item_id: string; eaten_on: string; deleted_at: string | null } | null;
  itemId: string;
}): boolean {
  const { kind, today, line, itemId } = params;
  return kind === "correction" && line !== null && line.item_id === itemId &&
    line.eaten_on === today && line.deleted_at === null;
}

/** Read the facts `mayRewriteLine` needs. A failed read throws; a missing line is null. */
export async function readLineForRewrite(lineId: string) {
  const { data, error } = await getServiceClient()
    .from("entry_items")
    .select("item_id, entries(eaten_on, deleted_at)")
    .eq("id", lineId)
    .maybeSingle();
  if (error) throw new LookupError(`Couldn't read that line: ${error.message}`);
  if (!data) return null;
  const entry = (Array.isArray(data.entries) ? data.entries[0] : data.entries) as
    { eaten_on: string; deleted_at: string | null } | null;
  if (!entry) return null;
  return { item_id: data.item_id as string, eaten_on: entry.eaten_on, deleted_at: entry.deleted_at };
}

/**
 * Point one line at a new version and copy its numbers. The old version stays
 * in `item_versions`, so the replaced figure is kept (Never 3).
 */
export async function rewriteLine(lineId: string, versionId: string, macros: Macros): Promise<void> {
  const { error } = await getServiceClient()
    .from("entry_items")
    .update({ item_version_id: versionId, kcal: macros.kcal, protein_g: macros.protein_g, carbs_g: macros.carbs_g, fat_g: macros.fat_g })
    .eq("id", lineId);
  if (error) throw new LookupError(`The correction was recorded but this line was not updated: ${error.message}`);
}
