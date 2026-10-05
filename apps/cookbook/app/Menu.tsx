"use client";

import { useCallback, useEffect, useState } from "react";
import { perServing, type Recipe } from "@/lib/recipes";
import { round } from "@/lib/macros";
import type { MenuEntry } from "@/lib/menu";
import { menuDayLabel, parseDay } from "@/lib/menuDay";
import { useToast } from "./Toast";

/**
 * On the menu — what Joel plans to cook, and on which day (TEC-39 C, 2026-09-24;
 * the day and the numbers, 2026-10-05).
 *
 * One row a recipe, soonest day first, in Joel's format:
 * `Tue 10/7 | Fried Catfish | 520 cal · 38g P · 22g F · 30g C /serv`. **Tapping
 * the day moves it**, tapping the name opens it in the book, ✕ takes it off, and
 * **Clear all** empties the menu — nothing falls off by itself any more. None of
 * them touches the list or the book. `lib/menu.ts` has the rules.
 *
 * **Left of the book on a wide screen, above it on a phone.** The wide column is
 * narrow, so there the numbers drop under the name rather than squeezing it.
 *
 * **Names and numbers come from the book, not from the menu's rows.** The menu
 * stores only which recipe and which day; the book on this page is already the
 * current recipe, so an edit that re-prices it shows here at once, and a recipe
 * removed from the book has left the menu by the foreign key's cascade.
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
  const [confirmingClear, setConfirmingClear] = useState(false);
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

  /** Optimistic, then the server's word: a failure says so and reads the menu again. */
  async function send(method: "PATCH" | "DELETE", payload: object, failure: string) {
    try {
      const response = await fetch("/api/menu", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? failure);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : failure);
      await load();
    }
  }

  function takeOff(recipeId: string) {
    setMenu((current) => (current ?? []).filter((m) => m.recipe_id !== recipeId));
    void send("DELETE", { recipe_id: recipeId }, "Couldn't take that off the menu.");
  }

  function move(recipeId: string, value: string) {
    const day = parseDay(value);
    // A cleared picker is not a day; leave the row where it was.
    if (!day) return;
    setMenu((current) =>
      (current ?? [])
        .map((m) => (m.recipe_id === recipeId ? { ...m, day } : m))
        .sort((a, b) => a.day.localeCompare(b.day) || a.added_at.localeCompare(b.added_at)),
    );
    void send("PATCH", { recipe_id: recipeId, day }, "Couldn't move that on the menu.");
  }

  function clearAll() {
    setConfirmingClear(false);
    setMenu([]);
    void send("DELETE", { all: true }, "Couldn't clear the menu.");
  }

  const byId = new Map((recipes ?? []).map((r) => [r.id, r]));
  const shown = (menu ?? []).filter((m) => byId.has(m.recipe_id));

  return (
    <section id="menu" className="flex scroll-mt-4 flex-col gap-2 rounded-lg border border-line p-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">On the menu</h2>
        {shown.length > 0 ? (
          confirmingClear ? (
            <span className="ml-auto flex gap-1">
              <button
                type="button"
                onClick={clearAll}
                className="rounded border border-danger/60 px-2 py-0.5 text-xs text-danger"
              >
                Clear all — sure?
              </button>
              <button
                type="button"
                onClick={() => setConfirmingClear(false)}
                className="rounded border border-line px-2 py-0.5 text-xs text-ink-soft"
              >
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingClear(true)}
              className="ml-auto rounded border border-line px-2 py-0.5 text-xs text-ink-soft"
            >
              Clear all
            </button>
          )
        ) : null}
      </div>

      {menu === null || recipes === null ? (
        readError ? (
          <p role="alert" className="text-sm text-danger">
            {readError}
          </p>
        ) : (
          <p className="text-sm text-ink-soft">Reading the menu…</p>
        )
      ) : shown.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Add a recipe&rsquo;s ingredients to the list, pick the day, and it shows up here.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {shown.map((m) => {
            const recipe = byId.get(m.recipe_id)!;
            const s = round(perServing(recipe));
            return (
              <li
                key={m.recipe_id}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-baseline gap-x-2 text-sm lg:grid-cols-[auto_minmax(0,1fr)_auto]"
              >
                {/* The day, and the way to move it: a real date input laid over
                    the label, so a tap on a phone opens the native picker, and
                    `showPicker` opens it on a desktop click too. */}
                <span className="relative w-16 shrink-0 text-[11px] tabular-nums text-ink-soft">
                  {menuDayLabel(m.day)}
                  <input
                    type="date"
                    value={m.day}
                    onChange={(e) => move(m.recipe_id, e.target.value)}
                    onClick={(e) => {
                      try {
                        e.currentTarget.showPicker();
                      } catch {
                        // Older browsers: the tap itself still focuses the input.
                      }
                    }}
                    aria-label={`Move ${recipe.name} to another day`}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </span>
                <button
                  type="button"
                  onClick={() => onOpen(m.recipe_id)}
                  className="min-w-0 truncate text-left underline decoration-line decoration-dotted underline-offset-2"
                >
                  {recipe.name}
                </button>
                <span className="text-[11px] tabular-nums text-ink-soft lg:col-start-2 lg:row-start-2">
                  {s.kcal} cal · {s.protein_g}g P · {s.fat_g}g F · {s.carbs_g}g C /serv
                </span>
                <button
                  type="button"
                  onClick={() => takeOff(m.recipe_id)}
                  aria-label={`Take ${recipe.name} off the menu`}
                  className="shrink-0 px-1 text-ink-soft lg:col-start-3 lg:row-start-1"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
