"use client";

import { useState } from "react";
import Book from "./Book";
import List from "./List";
import { ToastProvider } from "./Toast";

/**
 * The two tabs, and the one piece of state they share.
 *
 * **Tabs, and that is a reversal.** This app shipped as *site* — a thin index by
 * verb over one long page — and `SURFACE.md` still uses it as that rule's worked
 * example. Joel asked for tabs on 2026-09-22 after living with the page: adding a
 * recipe and shopping are different errands minutes apart, and scrolling past the
 * whole book to reach the list stopped being cheaper than a tap. **`SURFACE.md`
 * and `CLAUDE.md` are the technical director's to bring in line** — the note is in
 * this seat's `HANDOFF.md` and went to Joel to route. Until then this component is
 * deliberately the only place the contradiction lives, rather than being spread
 * through the app where it would be harder to undo.
 *
 * **Still one route.** Tabs here are state, not navigation: no router, no URL to
 * get out of step with what is on screen, and a reload lands you back on the book.
 * That keeps the reversal to what Joel actually asked for.
 *
 * Adding a recipe's ingredients to the list happens in the book and shows up in
 * the list, so something has to own the fact that the list is now stale. A counter
 * is the whole of it — the list refetches when it changes, which keeps both
 * components fetching their own data and neither one holding the other's.
 */

type Tab = "recipes" | "shop";

const TABS: { id: Tab; label: string }[] = [
  { id: "recipes", label: "Recipes" },
  // Named for where it actually goes. Every link on it is a King Soopers search,
  // so "Shopping list" was one word vaguer than the thing deserves.
  { id: "shop", label: "King Soopers list" },
];

export default function Cookbook() {
  const [tab, setTab] = useState<Tab>("recipes");
  const [listVersion, setListVersion] = useState(0);

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
              onClick={() => setTab(t.id)}
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
          <List refreshKey={listVersion} />
        </div>
      </div>
    </ToastProvider>
  );
}
