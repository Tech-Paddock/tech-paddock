import { getServiceClient } from "./supabase";
import { LookupError } from "./errors";

/**
 * On the menu — what Joel is eating this week (TEC-39 C, 2026-09-24).
 *
 * **Adding a recipe's ingredients to the list is the only way on.** One row per
 * recipe; adding it again restarts its seven days. **It falls off by being read
 * that way** — nothing deletes an old row. Reasoning in
 * the `cookbook_menu_and_line_recipes` migration.
 */

export type MenuEntry = { recipe_id: string; added_at: string };

/** Seven days, rolling from when a recipe was added — Joel's pick over a calendar week. */
export const MENU_DAYS = 7;

/** The oldest `added_at` still on the menu at `now`. */
export function menuSince(now: Date): string {
  return new Date(now.getTime() - MENU_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** Newest first. A failed read throws — an empty menu and an unread one are different facts. */
export async function readMenu(now: Date = new Date()): Promise<MenuEntry[]> {
  const { data, error } = await getServiceClient()
    .from("menu")
    .select("recipe_id, added_at")
    .gt("added_at", menuSince(now))
    .order("added_at", { ascending: false });

  if (error) throw new LookupError(`Couldn't read the menu: ${error.message}`);
  return (data ?? []) as MenuEntry[];
}

/** Put a recipe on the menu, or restart its seven days if it is already there. */
export async function putOnMenu(recipeId: string): Promise<void> {
  const { error } = await getServiceClient()
    .from("menu")
    .upsert({ recipe_id: recipeId, added_at: new Date().toISOString() }, { onConflict: "recipe_id" });
  if (error) throw new LookupError(`Couldn't put that on the menu: ${error.message}`);
}

/** ✕ — off the menu only. The list keeps its lines and the book keeps the recipe. */
export async function takeOffMenu(recipeId: string): Promise<void> {
  const { error } = await getServiceClient().from("menu").delete().eq("recipe_id", recipeId);
  if (error) throw new LookupError(`Couldn't take that off the menu: ${error.message}`);
}
