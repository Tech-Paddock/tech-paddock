import { getServiceClient } from "./supabase";
import { LookupError } from "./errors";

/**
 * On the menu — what Joel plans to cook, and on which day (TEC-39 C, 2026-09-24;
 * the day, 2026-10-05).
 *
 * **Adding a recipe's ingredients to the list is the only way on**, and that is
 * where the day is picked. **One row per recipe**: adding it again moves it to
 * the new day — Joel does not cook the same thing twice in a week. **Nothing
 * falls off by itself**: Joel clears it, one row or all of them. Reasoning in the
 * `cookbook_menu_day` migration; the day's own rules are in `lib/menuDay.ts`.
 */

export type MenuEntry = { recipe_id: string; day: string; added_at: string };

/** Soonest day first; a tie keeps the order they went on. A failed read throws — empty and unread differ. */
export async function readMenu(): Promise<MenuEntry[]> {
  const { data, error } = await getServiceClient()
    .from("menu")
    .select("recipe_id, day, added_at")
    .order("day", { ascending: true })
    .order("added_at", { ascending: true });

  if (error) throw new LookupError(`Couldn't read the menu: ${error.message}`);
  return (data ?? []) as MenuEntry[];
}

/**
 * Put a recipe on the menu for `day`, or move it there if it is already on.
 * **No day means the database's default**, today in Denver — only a request
 * from a page loaded before this shipped sends none.
 */
export async function putOnMenu(recipeId: string, day: string | null): Promise<void> {
  const row: Record<string, string> = { recipe_id: recipeId, added_at: new Date().toISOString() };
  if (day) row.day = day;
  const { error } = await getServiceClient().from("menu").upsert(row, { onConflict: "recipe_id" });
  if (error) throw new LookupError(`Couldn't put that on the menu: ${error.message}`);
}

/** Move a recipe already on the menu to another day. False if it was not on it. */
export async function moveOnMenu(recipeId: string, day: string): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from("menu")
    .update({ day })
    .eq("recipe_id", recipeId)
    .select("recipe_id");
  if (error) throw new LookupError(`Couldn't move that on the menu: ${error.message}`);
  return (data ?? []).length > 0;
}

/** ✕ — off the menu only. The list keeps its lines and the book keeps the recipe. */
export async function takeOffMenu(recipeId: string): Promise<void> {
  const { error } = await getServiceClient().from("menu").delete().eq("recipe_id", recipeId);
  if (error) throw new LookupError(`Couldn't take that off the menu: ${error.message}`);
}

/** Clear all — every row, and nothing else: the list and the book are untouched. */
export async function clearMenu(): Promise<void> {
  // PostgREST refuses a delete with no filter, so the filter is one every row meets.
  const { error } = await getServiceClient().from("menu").delete().not("recipe_id", "is", null);
  if (error) throw new LookupError(`Couldn't clear the menu: ${error.message}`);
}
