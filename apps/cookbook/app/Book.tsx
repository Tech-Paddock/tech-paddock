"use client";

import { useCallback, useEffect, useState } from "react";
import Menu from "./Menu";
import { AddToListCard, RecipeOpen } from "./RecipeDetail";
import { useToast } from "./Toast";
import { perServing, type Recipe } from "@/lib/recipes";
import { menuDayLabel } from "@/lib/menuDay";
import { FIRST_RECIPE_TAB, factsLine, macrosLine, type RecipeTab } from "@/lib/recipeView";
import EditRecipe from "./EditRecipe";
import { BookFilters } from "./Tuning";
import { NO_FILTER, cuisinesIn, filterActive, matchesFilter, type BookFilter } from "@/lib/tuning";

/**
 * The book: On the menu beside it, every kept recipe in it, and what you can do
 * to one — read it in tabs, rate it, add it to the list for a day, edit, remove.
 *
 * **Adding one is the Add tab's** (`AddRecipe.tsx`, 2026-10-05). The two
 * stay mounted side by side, so a recipe kept there reaches this one through
 * `version` rather than through shared state.
 */

export default function Book({
  onAddedToList,
  onRead,
  version = 0,
}: {
  onAddedToList?: () => void;
  /** Every time the book changes on screen — the Add tab offers its cuisines. */
  onRead?: (recipes: Recipe[]) => void;
  /** Bumped when a recipe is kept on the Add tab; the book reads itself again. */
  version?: number;
}) {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  // Only for the read itself. Everything else reports through a toast; a book
  // that could not be read is a state, and it stays on screen while it is true.
  const [readError, setReadError] = useState<string | null>(null);
  const toast = useToast();
  const [filter, setFilter] = useState<BookFilter>(NO_FILTER);

  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // The recipe whose ingredients are on their way to the list, if any.
  const [listing, setListing] = useState<string | null>(null);
  // The recipe whose rating is being saved, if any.
  const [rating, setRatingBusy] = useState<string | null>(null);
  // Bumped whenever the menu may have changed: a recipe added to the list, or
  // one removed from the book (which takes it off the menu too).
  const [menuVersion, setMenuVersion] = useState(0);

  /** From the menu: open that recipe in the book and bring it into view. */
  function openFromMenu(recipeId: string) {
    setQuery("");
    setOpenId(recipeId);
    // After the render that clears the search and opens the card.
    setTimeout(() => {
      document.getElementById(`recipe-${recipeId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/recipes", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't read the book.");
      setRecipes(body.recipes as Recipe[]);
      setReadError(null);
    } catch (e) {
      // Deliberately leaves `recipes` null rather than setting it to []. An
      // unread book and an empty book must not render the same.
      setReadError(e instanceof Error ? e.message : "Couldn't read the book.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  useEffect(() => {
    if (recipes) onRead?.(recipes);
  }, [recipes, onRead]);

  /** Its ingredients onto the list, and it onto the menu for `day` (2026-10-05). */
  async function toList(recipe: Recipe, day: string) {
    // One at a time. A second tap while the first is in flight used to put the
    // ingredients on the list twice (TEC-29 item 8).
    if (listing) return;
    setListing(recipe.id);
    try {
      const response = await fetch("/api/recipes/grocery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recipe.id, day }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't add those.");
      const count = `${body.added} ingredient${body.added === 1 ? "" : "s"}`;
      // The lines landed either way; only the menu entry can have failed, and
      // it is said so rather than hidden behind a success.
      if (body.menu === false) toast.error(`${count} added to your list, but it couldn't go on the menu.`);
      else toast.notice(`${count} added to your list, and "${recipe.name}" is on the menu for ${menuDayLabel(day)}.`);
      onAddedToList?.();
      setMenuVersion((n) => n + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add those.");
    } finally {
      setListing(null);
    }
  }

  /**
   * Rate a recipe in the book, or clear it (TEC-52) — the one-tap edit, without
   * opening the editor. The row comes back and replaces the one on screen; a
   * failure leaves the old rating showing and says so.
   */
  async function rate(recipe: Recipe, value: number | null) {
    if (rating) return;
    setRatingBusy(recipe.id);
    try {
      const response = await fetch("/api/recipes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recipe.id, rating: value }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't rate that.");
      const updated = body.recipe as Recipe;
      setRecipes((all) => (all ? all.map((r) => (r.id === updated.id ? updated : r)) : all));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't rate that.");
    } finally {
      setRatingBusy(null);
    }
  }

  /** An edit saved (`EditRecipe`): the row that came back replaces the one on screen. */
  function edited(updated: Recipe, repriced: boolean) {
    setRecipes((all) => (all ? all.map((r) => (r.id === updated.id ? updated : r)) : all));
    toast.notice(repriced ? `"${updated.name}" is saved and re-priced.` : `"${updated.name}" is saved.`);
  }

  async function remove(recipe: Recipe) {
    try {
      const response = await fetch("/api/recipes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recipe.id }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't remove that.");
      toast.notice(`"${recipe.name}" is out of the book. Your list keeps anything you already added.`);
      await load();
      setMenuVersion((n) => n + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove that.");
    }
  }

  /**
   * **Name and ingredients, and deliberately not the method.** "Fry the onion"
   * is in half the book, so matching on it returns half the book. What you search
   * for here is a dish or a thing in the fridge.
   *
   * Filtered in the browser because the whole book is already here. When it stops
   * being, this moves to the query — the shape of the answer does not change.
   */
  const shown = (recipes ?? []).filter((recipe) => {
    // The filters first (`matchesFilter`): every one set must hold.
    if (!matchesFilter(recipe, filter)) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      recipe.name.toLowerCase().includes(q) ||
      recipe.ingredients.some((i) => i.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col gap-8">

      {/* On the menu, then the book: stacked on a phone, side by side on a wide
          screen with the menu on the left (TEC-39 C, 2026-09-24). */}
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <Menu recipes={recipes} version={menuVersion} onOpen={openFromMenu} />

      {/* ------------------------------------------------------------------ */}
      {/* The book, under the form now. It is still the reason you came.     */}
      {/* ------------------------------------------------------------------ */}
      {/* Boxed and named "Recipes" — the same frame as the
          panel above, so the page reads as two things rather than one form
          trailing into a list. */}
      {/* The new look (TEC-135, the owner's mockup): a heading with the count,
          a full-width search, the filters, then cards. Behaviour unchanged. */}
      <section id="book" className="flex scroll-mt-4 flex-col gap-2">
        <div className="flex flex-col gap-1 px-2">
          <h2 className="text-xl font-bold">Recipes</h2>
          {recipes !== null ? (
            <p className="text-[13px] text-ink-soft">
              {recipes.length} recipe{recipes.length === 1 ? "" : "s"} · per serving
            </p>
          ) : null}
        </div>
        {recipes !== null && recipes.length > 0 ? (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            placeholder="Search the book"
            aria-label="Search recipes"
            className="min-h-10 rounded-xl border border-line bg-surface px-3.5 text-base"
          />
        ) : null}
        {recipes !== null && recipes.length > 0 ? (
          <BookFilters value={filter} onChange={setFilter} cuisines={cuisinesIn(recipes)} />
        ) : null}

        {recipes === null ? (
          readError ? (
            <p role="alert" className="text-sm text-danger">
              {readError}
            </p>
          ) : (
            <p className="text-sm text-ink-soft">Reading the book…</p>
          )
        ) : recipes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-soft">
            Nothing in it yet. Add one on the Add tab: type it, ask Claude, or bring a link or a file.
          </p>
        ) : shown.length === 0 ? (
          // Deliberately not the same sentence as an empty book. "Nothing here"
          // and "nothing matched" send you to different next actions.
          <p className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-soft">
            {query.trim() ? `Nothing matches “${query.trim()}”` : "Nothing matches"}
            {filterActive(filter) ? " with these filters. A recipe with that detail not set never matches it." : "."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {shown.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                open={openId === recipe.id}
                onToggle={() => setOpenId(openId === recipe.id ? null : recipe.id)}
                listing={listing === recipe.id}
                onList={(day) => toList(recipe, day)}
                rating={rating === recipe.id}
                onRate={(value) => rate(recipe, value)}
                onRemove={() => remove(recipe)}
                onEdited={edited}
              />
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  );
}

export function RecipeCard({
  recipe,
  open,
  listing,
  rating,
  onToggle,
  onList,
  onRate,
  onRemove,
  onEdited,
}: {
  recipe: Recipe;
  open: boolean;
  listing: boolean;
  rating: boolean;
  onToggle: () => void;
  onList: (day: string) => void;
  onRate: (value: number | null) => void;
  onRemove: () => void;
  onEdited: (recipe: Recipe, repriced: boolean) => void;
}) {
  // Which tab is showing; the card stays mounted, so it is held while the book is.
  const [tab, setTab] = useState<RecipeTab>(FIRST_RECIPE_TAB);
  // Every field is editable (2026-09-26), in place on the open card.
  const [editing, setEditing] = useState(false);
  const facts = factsLine(recipe);

  return (
    // The id is what "On the menu" scrolls to.
    <li id={`recipe-${recipe.id}`} className="scroll-mt-4 overflow-hidden rounded-xl bg-surface">
      {/* **Three short text lines** (TEC-189, the owner's pick from the preview):
          the name; then rating · Prep · Cook · makes N, each part absent when
          unset (the old total stands in only while neither Prep nor Cook is
          set); then one serving's numbers as text. The four macro tiles are
          gone from the list (the Macros tab keeps them). **Origin is no longer
          on the line**: it did not fit at 360px beside Prep and Cook, and the
          open recipe still says it. `truncate` on the name, not a character
          count, so a long name gives way and the facts do not. */}
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-col gap-0.5 px-3 py-2 text-left">
        <span className="min-w-0 truncate text-[15px] font-semibold">{recipe.name}</span>
        <span className="text-xs text-ink-soft">
          {facts.stars ? (
            <>
              <span aria-label={`Rated ${recipe.rating} of 5`} className="font-semibold text-accent">{facts.stars}</span>
              {" · "}
            </>
          ) : null}
          {facts.rest}
        </span>
        <span className="text-xs tabular-nums text-ink-soft">{macrosLine(perServing(recipe))}</span>
      </button>

      {open && editing ? (
        <div className="border-t border-line p-3">
          <EditRecipe
            recipe={recipe}
            onCancel={() => setEditing(false)}
            onSaved={(updated, repriced) => {
              setEditing(false);
              onEdited(updated, repriced);
            }}
          />
        </div>
      ) : open ? (
        // **The recipe opens in tabs** (TEC-183): name, origin · makes · time and
        // the rating up top, then Ingredients · Method · Macros, then Add to list
        // by a date box (TEC-189) with Edit and Remove under it. The helpings estimator and the
        // keywords are gone; Health's `GET /api/servings` is untouched.
        <div className="flex flex-col gap-4 border-t border-line/40 px-3.5 py-3">
          <RecipeOpen recipe={recipe} tab={tab} onTab={setTab} onRate={onRate} rating={rating} />
          <AddToListCard
            name={recipe.name}
            hasIngredients={recipe.ingredients.length > 0}
            listing={listing}
            onList={onList}
            onEdit={() => setEditing(true)}
            onRemove={onRemove}
          />
          <p className="text-[11px] text-ink-soft">
            Editing re-prices only when the ingredients change. Removing takes the recipe out of the book and
            leaves your shopping list alone.
          </p>
        </div>
      ) : null}
    </li>
  );
}
