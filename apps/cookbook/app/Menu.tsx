"use client";

import { useCallback, useEffect, useState } from "react";
import type { Recipe } from "@/lib/recipes";
import type { MenuEntry } from "@/lib/menu";
import { useToast } from "./Toast";

/**
 * On the menu — what Joel is eating this week (TEC-39 C, 2026-09-24).
 *
 * Every recipe sent to the list in the last seven days, rolling, newest first,
 * with the day it went on. **Left of the book on a wide screen, above it on a
 * phone.** Tapping a name opens that recipe in the book; ✕ takes it off the menu
 * and does nothing else. `lib/menu.ts` has the rules.
 *
 * **Names come from the book, not from the menu's rows.** The menu stores only
 * which recipe and when; the book on this page is already the current name, and
 * a recipe removed from the book has left the menu by the foreign key's cascade.
 */
export default function Menu({
  recipes,
  version,
  onOpen,
}: {
  recipes: Recipe[] | null;
  /** Bumped by the book whenever it may have changed the menu. */
  version: number;
  onOpen: (recipeId: string) => void;
}) {
  const [menu, setMenu] = useState<MenuEntry[] | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/menu", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't read the menu.");
      setMenu(body.menu as MenuEntry[]);
      setReadError(null);
    } catch (e) {
      // Null, never []: "nothing on the menu" invites you to add something, and
      // a menu that could not be read is not that.
      setReadError(e instanceof Error ? e.message : "Couldn't read the menu.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  async function takeOff(recipeId: string) {
    setMenu((current) => (current ?? []).filter((m) => m.recipe_id !== recipeId));
    try {
      const response = await fetch("/api/menu", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe_id: recipeId }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't take that off the menu.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't take that off the menu.");
      await load();
    }
  }

  const byId = new Map((recipes ?? []).map((r) => [r.id, r]));
  const shown = (menu ?? []).filter((m) => byId.has(m.recipe_id));

  return (
    <section id="menu" className="flex scroll-mt-4 flex-col gap-2 rounded-lg border border-line p-3">
      <h2 className="text-base font-semibold">On the menu</h2>

      {menu === null || recipes === null ? (
        readError ? (
          <p role="alert" className="text-sm text-danger">
            {readError}
          </p>
        ) : (
          <p className="text-sm text-ink-soft">Reading the menu…</p>
        )
      ) : shown.length === 0 ? (
        <p className="text-sm text-ink-soft">Add a recipe&rsquo;s ingredients to the list and it shows up here.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {shown.map((m) => (
            <li key={m.recipe_id} className="flex items-baseline gap-2 text-sm">
              <span className="w-8 shrink-0 text-[11px] text-ink-soft">
                {new Date(m.added_at).toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <button
                type="button"
                onClick={() => onOpen(m.recipe_id)}
                className="min-w-0 flex-1 truncate text-left underline decoration-line decoration-dotted underline-offset-2"
              >
                {byId.get(m.recipe_id)?.name}
              </button>
              <button
                type="button"
                onClick={() => takeOff(m.recipe_id)}
                aria-label={`Take ${byId.get(m.recipe_id)?.name} off the menu`}
                className="shrink-0 px-1 text-ink-soft"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
