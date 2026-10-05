"use client";

import { useCallback, useEffect, useState } from "react";
import Provenance from "./Provenance";
import Menu from "./Menu";
import MacroRow from "./MacroRow";
import { useToast } from "./Toast";
import { round, scale } from "@/lib/macros";
import { DEFAULT_MODEL, type ModelId } from "@/lib/models";
import { methodSteps, perServing, type Recipe, type RecipeOrigin } from "@/lib/recipes";
import { formatMinutes, pillFacts } from "@/lib/metadata";
import { localToday, menuDayLabel, parseDay } from "@/lib/menuDay";
import { MetaSummary, Stars } from "./Meta";
import EditRecipe from "./EditRecipe";
import { BookFilters } from "./Tuning";
import { NO_FILTER, cuisinesIn, filterActive, matchesFilter, type BookFilter } from "@/lib/tuning";

/**
 * The book: On the menu beside it, every kept recipe in it, and what you can do
 * to one — price helpings, add it to the list for a day, rate, edit, remove.
 *
 * **Adding one is the Add tab's** (`AddRecipe.tsx`, Joel, 2026-10-05). The two
 * stay mounted side by side, so a recipe kept there reaches this one through
 * `version` rather than through shared state.
 */

const ORIGIN_LABELS: Record<RecipeOrigin, string> = {
  manual: "Yours",
  generated: "Claude's",
  imported: "Imported",
};

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
  // The model an edit re-prices with. Drafting has its own, on the Add tab.
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);

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
          screen with the menu on the left (Joel, 2026-09-24, TEC-39 C). */}
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <Menu recipes={recipes} version={menuVersion} onOpen={openFromMenu} />

      {/* ------------------------------------------------------------------ */}
      {/* The book, under the form now. It is still the reason you came.     */}
      {/* ------------------------------------------------------------------ */}
      {/* Boxed and named "Recipes", Joel on 2026-09-22 — the same frame as the
          panel above, so the page reads as two things rather than one form
          trailing into a list. */}
      <section id="book" className="flex scroll-mt-4 flex-col gap-3 rounded-lg border border-line p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">Recipes</h2>
          {recipes !== null && recipes.length > 0 ? (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              placeholder="Search"
              aria-label="Search your recipes"
              className="ml-auto min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm sm:max-w-56"
            />
          ) : null}
        </div>
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
          <ul className="flex flex-col gap-2">
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
                model={model}
                onModel={setModel}
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

function RecipeCard({
  recipe,
  open,
  listing,
  rating,
  onToggle,
  onList,
  onRate,
  onRemove,
  model,
  onModel,
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
  model: ModelId;
  onModel: (model: ModelId) => void;
  onEdited: (recipe: Recipe, repriced: boolean) => void;
}) {
  const [count, setCount] = useState("1");
  // The day it goes on the menu (Joel, 2026-10-05). Today unless he picks another.
  const [day, setDay] = useState(() => localToday());
  // Every field is editable (Joel, 2026-09-26), in place on the open card.
  const [editing, setEditing] = useState(false);
  // **Remove asks first** (TEC-29 item 8): it is permanent, and it sat one tap
  // from Add to list.
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const serving = perServing(recipe);
  const helpings = Number(count);
  const priced = Number.isFinite(helpings) && helpings > 0 ? scale(serving, helpings) : null;
  const minutes = formatMinutes(recipe.total_minutes);
  const facts = pillFacts(recipe);

  return (
    // The id is what "On the menu" scrolls to.
    <li id={`recipe-${recipe.id}`} className="scroll-mt-4 rounded-lg border border-line bg-surface">
      {/* **A lean pill: the name gives way, the facts do not.** `truncate` rather
          than a character count — a count that fits a laptop overflows a phone,
          and this is mostly a phone object. `min-w-0` is what lets the name
          shrink at all inside a flex row, and `shrink-0` on the rest is what
          stops the kcal being the thing that disappears.
          **Rating and time stay on a phone; meal, main and cuisine give way**
          (TEC-52), as the origin already did. Each is simply absent when unset,
          which is every recipe until the backfill. */}
      <button type="button" onClick={onToggle} className="flex w-full items-baseline gap-2 p-3 text-left">
        <span className="min-w-0 truncate text-sm font-medium">{recipe.name}</span>
        {recipe.rating ? (
          <span className="shrink-0 text-[11px]">
            <Stars rating={recipe.rating} />
          </span>
        ) : null}
        {minutes ? <span className="shrink-0 text-[11px] tabular-nums text-ink-soft">{minutes}</span> : null}
        <span className="hidden shrink-0 text-[11px] text-ink-soft sm:inline">
          {facts.length ? `${facts.join(" · ")} · ` : ""}
          {ORIGIN_LABELS[recipe.origin]} · makes {recipe.servings}
        </span>
        <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-soft">
          {round(serving).kcal} kcal a serving
        </span>
      </button>

      {open && editing ? (
        <div className="border-t border-line p-3">
          <EditRecipe
            recipe={recipe}
            model={model}
            onModel={onModel}
            onCancel={() => setEditing(false)}
            onSaved={(updated, repriced) => {
              setEditing(false);
              onEdited(updated, repriced);
            }}
          />
        </div>
      ) : open ? (
        <div className="flex flex-col gap-3 border-t border-line p-3">
          <MacroRow macros={serving} per="one serving" />
          <Provenance source={recipe.source} model={recipe.model} url={recipe.source_url} />
          <MetaSummary meta={recipe} />
          <div className="flex items-center gap-2 text-xs text-ink-soft">
            <span>Your rating</span>
            <Stars rating={recipe.rating} onRate={onRate} busy={rating} />
          </div>

          {/* **`recipe.note` is stored and deliberately not shown here.** It is the
              estimate's own caveat — "assumed a tablespoon of oil" — which is what
              you want when deciding whether to keep a number and noise when you
              are cooking. It still renders on the draft, where the deciding
              happens, and it is still on the row for anything that wants it. */}

          {recipe.ingredients.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {recipe.ingredients.map((i, n) => (
                <li key={n}>{i}</li>
              ))}
            </ul>
          ) : null}
          {methodSteps(recipe.method).length > 0 ? (
            <ol className="flex list-inside list-decimal flex-col gap-1.5 text-sm text-ink-soft">
              {methodSteps(recipe.method).map((step, n) => (
                // The marker the author wrote is stripped so the list's own
                // numbering does not print "1. 1. Chop the onion".
                <li key={n}>{step.replace(/^\d{1,2}[.)]\s*/, "")}</li>
              ))}
            </ol>
          ) : null}

          {/* **Pricing helpings, and deliberately not logging them.**
              Multiplying a stored serving is arithmetic in this browser — no
              model, no request, nothing written. Logging what you ate is
              Health's: it reads `GET /api/servings` under the contract in
              `RULES.md` (TEC-11), and this app never writes a log. */}
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                value={count}
                onChange={(e) => setCount(e.target.value)}
                inputMode="decimal"
                aria-label={`Helpings of ${recipe.name}`}
                className="w-16 rounded border border-line bg-surface px-2 py-1.5 text-sm"
              />
              <span className="text-ink-soft">helpings cost</span>
            </label>
            {priced ? (
              <span className="text-sm tabular-nums">
                {round(priced).kcal} kcal · {round(priced).protein_g}g protein
              </span>
            ) : (
              <span className="text-sm text-ink-soft">—</span>
            )}

            {/* The day picked here is the day it sits on the menu. A cleared
                picker would send no day at all, so it disables the button
                instead of quietly meaning "today". */}
            <span className="ml-auto flex items-center gap-2">
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              aria-label={`Day to cook ${recipe.name}`}
              className="rounded border border-line bg-surface px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                const picked = parseDay(day);
                if (picked) onList(picked);
              }}
              disabled={recipe.ingredients.length === 0 || listing || !parseDay(day)}
              className="rounded border border-line px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {listing ? "Adding…" : "Add to list"}
            </button>
            </span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded border border-line px-3 py-1.5 text-sm"
            >
              Edit
            </button>
            {confirmingRemove ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingRemove(false);
                    onRemove();
                  }}
                  className="rounded border border-danger/60 px-3 py-1.5 text-sm text-danger"
                >
                  Remove — sure?
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(false)}
                  className="rounded border border-line px-3 py-1.5 text-sm text-ink-soft"
                >
                  Keep it
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingRemove(true)}
                className="rounded border border-line px-3 py-1.5 text-sm text-ink-soft"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-[11px] text-ink-soft">
            Pricing helpings reads the numbers above and calls nothing. Editing re-prices only when the
            ingredients change. Removing takes the recipe out of the book and leaves your shopping list
            alone.
          </p>
        </div>
      ) : null}
    </li>
  );
}
