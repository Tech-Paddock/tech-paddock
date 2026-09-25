"use client";

import { useState } from "react";
import Book from "./Book";
import List from "./List";
import { ToastProvider } from "./Toast";
import { TABS, pathFor, type Tab } from "@/lib/tabs";

/**
 * The two tabs, and the one piece of state they share.
 *
 * **Tabs are the verb index.** The surface is *site*, settled at standup on
 * 2026-09-20, and its tabs are that index, one verb each: the technical
 * director's ruling on 2026-09-24, after Joel asked for tabs on 2026-09-22.
 * Adding a recipe and shopping are different errands minutes apart, and scrolling
 * past the whole book to reach the list stopped being cheaper than a tap.
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
 * components fetching their own data and neither one holding the other's.
 */

export type { Tab };

export default function Cookbook({ initialTab = "recipes" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [listVersion, setListVersion] = useState(0);

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
        <div role="tablist" aria-label="Cookbook" className="flex gap-1 rounded-lg border border-line bg-surface p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => choose(t.id)}
              className={`flex-1 rounded px-3 py-2 text-sm ${
                tab === t.id ? "bg-accent font-semibold text-accent-ink" : "text-ink-soft"
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
          <Book onAddedToList={() => setListVersion((n) => n + 1)} />
        </div>
        <div role="tabpanel" id="panel-shop" aria-labelledby="tab-shop" hidden={tab !== "shop"}>
          <div className="mx-auto w-full max-w-2xl">
            <List refreshKey={listVersion} />
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
