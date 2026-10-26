"use client";

import { useCallback, useMemo, useState } from "react";
import AddRecipe from "./AddRecipe";
import Book from "./Book";
import List from "./List";
import Brands from "./Brands";
import DealsTab from "./DealsTab";
import { ToastProvider } from "./Toast";
import { TABS, pathFor, type Tab } from "@/lib/tabs";
import { cuisinesIn } from "@/lib/tuning";
import type { Recipe } from "@/lib/recipes";

/**
 * The tabs, and the little state they share.
 *
 * **Tabs are the verb index.** The surface is *site*, settled at standup on
 * 2026-09-20, and its tabs are that index, one verb each: the technical
 * director's ruling on 2026-09-24.
 * Adding a recipe and shopping are different errands minutes apart, and scrolling
 * past the whole book to reach the list stopped being cheaper than a tap. **Add
 * became the third** on 2026-10-05, replacing the two-tab ruling.
 *
 * **Each tab has an address** since TEC-22: `/` is the book and `/list` is the
 * list, which Health's `/list` redirects onto while the list moves here. Switching
 * tabs replaces the address rather than navigating, so nothing is re-rendered
 * from the server and nothing on screen is thrown away — and a reload, a bookmark
 * or a shared link lands on the tab it names. **Replaced, not pushed**: a tab is
 * a view of one page, and Back should leave the app rather than walk you back
 * through every tab you glanced at.
 *
 * Adding a recipe's ingredients to the list happens in the book and shows up in
 * the list, so something has to own the fact that the list is now stale. A counter
 * is the whole of it — the list refetches when it changes, which keeps both
 * components fetching their own data and neither one holding the other's. A
 * recipe kept on Add reaches the book the same way, and the book hands back its
 * cuisines for Add's picker.
 */

export type { Tab };

export default function Cookbook({ initialTab = "recipes" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [listVersion, setListVersion] = useState(0);
  const [bookVersion, setBookVersion] = useState(0);
  const [cuisines, setCuisines] = useState<string[]>([]);
  // The book's names by id, for the list's Cooking this week (TEC-135).
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const recipeNames = useMemo(() => new Map(recipes.map((r) => [r.id, r.name])), [recipes]);
  // Your brands and the list each change what the other shows: a send or a
  // refresh changes Your brands, and an edit there changes the list's links.
  const [brandsVersion, setBrandsVersion] = useState(0);
  // The list's open lines, for the Deals tab's On my list (TEC-132); null until the list is read.
  const [openLines, setOpenLines] = useState<string[] | null>(null);
  const onRead = useCallback((read: Recipe[]) => {
    setCuisines(cuisinesIn(read));
    setRecipes(read);
  }, []);

  function choose(next: Tab) {
    setTab(next);
    const path = pathFor(next);
    // Only the path changes. Any query string — the hub framing this page — stays.
    if (window.location.pathname !== path) {
      window.history.replaceState(null, "", path + window.location.search);
    }
  }

  return (
    <ToastProvider>
      <div className="flex flex-col gap-6">
        {/* Pills in one scrolling row (TEC-135, the owner's mockup): the chosen tab filled with the accent. */}
        <div role="tablist" aria-label="Cookbook" className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => choose(t.id)}
              className={`whitespace-nowrap rounded-full px-3 py-2.5 text-[13px] ${
                tab === t.id ? "bg-accent font-semibold text-accent-ink" : "text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* **Both panels stay mounted; only the inactive one is hidden.** Unmounting
            would throw away the book's fetched rows, your search text and any draft
            you were part-way through every time you glanced at the list, and a draft
            is unsaved work by definition. `hidden` keeps them off the accessibility
            tree without costing that. */}
        <div role="tabpanel" id="panel-recipes" aria-labelledby="tab-recipes" hidden={tab !== "recipes"}>
          <Book onAddedToList={() => setListVersion((n) => n + 1)} onRead={onRead} version={bookVersion} />
        </div>
        <div role="tabpanel" id="panel-add" aria-labelledby="tab-add" hidden={tab !== "add"}>
          <div className="mx-auto w-full max-w-2xl">
            <AddRecipe cuisines={cuisines} onKept={() => setBookVersion((n) => n + 1)} />
          </div>
        </div>
        <div role="tabpanel" id="panel-shop" aria-labelledby="tab-shop" hidden={tab !== "shop"}>
          <div className="mx-auto w-full max-w-2xl">
            <List refreshKey={listVersion} onBrandsChanged={() => setBrandsVersion((n) => n + 1)} onOpenLines={setOpenLines} recipeNames={recipeNames} />
          </div>
        </div>
        <div role="tabpanel" id="panel-brands" aria-labelledby="tab-brands" hidden={tab !== "brands"}>
          <div className="mx-auto w-full max-w-2xl">
            <Brands refreshKey={brandsVersion} onChanged={() => setListVersion((n) => n + 1)} />
          </div>
        </div>
        <div role="tabpanel" id="panel-deals" aria-labelledby="tab-deals" hidden={tab !== "deals"}>
          <div className="mx-auto w-full max-w-2xl">
            <DealsTab refreshKey={brandsVersion} openLines={openLines} />
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
