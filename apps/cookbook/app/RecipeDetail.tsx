"use client";

import { useCallback, useEffect, useState } from "react";
import MacroTab from "./MacroTab";
import { methodSteps } from "@/lib/recipeSteps";
import type { Recipe, RecipeOrigin } from "@/lib/recipes";
import { mealLabel, timeParts } from "@/lib/metadata";
import { localToday, parseDay } from "@/lib/menuDay";
import {
  greyKey,
  isGreyed,
  readGreyed,
  toggleGreyed,
  writeGreyed,
  type Greyed,
  type GreyKind,
} from "@/lib/greyedRows";
import { RECIPE_TABS, splitIngredient, type RecipeTab } from "@/lib/recipeView";
import { MAX_SERVINGS, MIN_SERVINGS, scaleFactor, scaleIngredient, stepServings } from "@/lib/scaleServings";

/**
 * The open recipe's body (TEC-183, reworked in TEC-235). **The title, the facts
 * line and the rating are the card's header** (`RecipeCard` in `Book.tsx`), so
 * the name shows once and tapping it closes the card. This file draws what is
 * under it: the servings dial, then Ingredients · Steps · Macros as tabs. The
 * keywords (main, cuisine, equipment, diet, tags) are stored and editable in Edit
 * and not shown here; the meal is, by its name (TEC-205). Local patterns: the
 * segmented tabs, the numbered circles, the servings dial. Add to list is a date
 * box (TEC-189).
 */

export const ORIGIN_LABELS: Record<RecipeOrigin, string> = {
  manual: "Yours",
  generated: "Claude's",
  imported: "Imported",
};

const GREY_ROW = "text-ink-soft line-through opacity-60";

/**
 * Tap-to-grey state for one recipe (TEC-222), kept in this browser only. Read
 * after mount (so the server markup matches), again whenever the page becomes
 * visible, and dropped by `readGreyed` once 24 hours have passed since the last
 * tap. Every storage touch is in try/catch; without storage the rows still grey
 * for as long as the page is open.
 */
function useGreyed(recipeId: string) {
  const [greyed, setGreyed] = useState<Greyed | null>(null);

  const load = useCallback(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(greyKey(recipeId));
    } catch {
      /* storage is unavailable: render normally */
    }
    const state = readGreyed(raw, Date.now());
    if (raw && !state) {
      try {
        window.localStorage.removeItem(greyKey(recipeId));
      } catch {
        /* nothing to clean */
      }
    }
    setGreyed(state);
  }, [recipeId]);

  useEffect(() => {
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const toggle = (kind: GreyKind, index: number) => {
    const next = toggleGreyed(greyed, kind, index, Date.now());
    setGreyed(next);
    try {
      const text = writeGreyed(next);
      if (text) window.localStorage.setItem(greyKey(recipeId), text);
      else window.localStorage.removeItem(greyKey(recipeId));
    } catch {
      /* storage is unavailable or full: the grey lasts while the page is open */
    }
  };

  return { greyed, toggle };
}

export function RecipeOpen({
  recipe,
  tab,
  onTab,
}: {
  recipe: Recipe;
  tab: RecipeTab;
  onTab: (tab: RecipeTab) => void;
}) {
  const steps = methodSteps(recipe.method);
  const { greyed, toggle } = useGreyed(recipe.id);
  // The servings dial (TEC-235): this view only. It scales the lines shown and
  // changes nothing stored, so closing the card puts it back to the recipe's own.
  const [viewServings, setViewServings] = useState(recipe.servings);
  const factor = scaleFactor(viewServings, recipe.servings);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between rounded-xl bg-accent/10 py-1 pl-3 pr-1">
        <span className="text-sm font-semibold">Servings</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setViewServings((n) => stepServings(n, -1))}
            disabled={viewServings <= MIN_SERVINGS}
            aria-label="Fewer servings"
            className="h-10 w-10 rounded-full bg-surface text-lg font-bold text-accent disabled:opacity-40"
          >
            −
          </button>
          <output aria-live="polite" className="min-w-8 text-center font-bold tabular-nums">
            {viewServings}
          </output>
          <button
            type="button"
            onClick={() => setViewServings((n) => stepServings(n, 1))}
            disabled={viewServings >= MAX_SERVINGS}
            aria-label="More servings"
            className="h-10 w-10 rounded-full bg-surface text-lg font-bold text-accent disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      <div role="tablist" aria-label="Recipe sections" className="flex gap-0.5 rounded-xl bg-raised p-0.5">
        {RECIPE_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${recipe.id}-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${recipe.id}-${t.key}`}
            onClick={() => onTab(t.key)}
            className={`min-h-9 flex-1 rounded-[10px] px-2 text-[13px] font-semibold ${
              tab === t.key ? "bg-accent text-accent-ink" : "text-ink-soft"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* **`recipe.note` is stored and deliberately not shown here.** It is the
          estimate's own caveat — "assumed a tablespoon of oil" — which is what
          you want when deciding whether to keep a number and noise when you
          are cooking. It still renders on the draft. */}
      <div
        role="tabpanel"
        id={`panel-${recipe.id}-${tab}`}
        aria-labelledby={`tab-${recipe.id}-${tab}`}
      >
        {tab === "ingredients" ? (
          recipe.ingredients.length > 0 ? (
            <ul className="flex flex-col text-sm">
              {recipe.ingredients.map((line, n) => {
                const { amount, text } = splitIngredient(scaleIngredient(line, factor));
                const off = isGreyed(greyed, "ingredient", n);
                return (
                  <li key={n} className="border-t border-line/30 first:border-t-0">
                    <button
                      type="button"
                      aria-pressed={off}
                      onClick={() => toggle("ingredient", n)}
                      className={`grid min-h-9 w-full grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-2.5 py-1.5 text-left leading-snug ${off ? GREY_ROW : ""}`}
                    >
                      {amount ? (
                        <>
                          <span className="font-semibold tabular-nums">{amount}</span>
                          <span>{text}</span>
                        </>
                      ) : (
                        <span className="col-span-2">{text}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-soft">No ingredients.</p>
          )
        ) : tab === "steps" ? (
          steps.length > 0 ? (
            <ol className="flex flex-col gap-1.5 text-sm">
              {steps.map((step, n) => {
                const off = isGreyed(greyed, "step", n);
                return (
                  <li key={n}>
                    <button
                      type="button"
                      aria-pressed={off}
                      onClick={() => toggle("step", n)}
                      className="flex min-h-9 w-full gap-3 py-0.5 text-left"
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-raised text-xs font-bold tabular-nums"
                      >
                        {n + 1}
                      </span>
                      {/* The marker the author wrote is stripped so the circle's
                          number does not print beside "1. Chop the onion". */}
                      <span className={`pt-0.5 ${off ? GREY_ROW : ""}`}>{step.replace(/^\d{1,2}[.)]\s*/, "")}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-ink-soft">No steps.</p>
          )
        ) : (
          <MacroTab recipe={recipe} />
        )}
      </div>
    </div>
  );
}

/**
 * The bottom of an open recipe (TEC-235; Add to list became one date box in
 * TEC-189). **One row** holds the cook date and Add to list. Under it, Edit and
 * Remove are quiet text buttons and Remove asks once, inline. Under those, a small
 * underlined "Revert to original" link (the old "Revert to imported", same
 * behaviour: it still asks once). No warning text. A cleared date disables Add to
 * list instead of quietly meaning "today".
 */
export function AddToListCard({
  name,
  hasIngredients,
  listing,
  onList,
  onEdit,
  onRemove,
  onRevert,
  today = localToday(),
}: {
  name: string;
  hasIngredients: boolean;
  listing: boolean;
  onList: (day: string) => void;
  onEdit: () => void;
  onRemove: () => void;
  /** Only for a recipe with an imported original (TEC-201): put the original back. */
  onRevert?: () => void;
  /** Injected by the tests; the browser's own today otherwise. */
  today?: string;
}) {
  const [day, setDay] = useState(today);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [confirmingRevert, setConfirmingRevert] = useState(false);
  const picked = parseDay(day);
  const quiet = "min-h-9 px-3 text-[13px] font-semibold";
  const pill = "min-h-9 rounded-full border px-3.5 text-[13px] font-semibold";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-stretch gap-2">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3">
          <span className="shrink-0 text-xs text-ink-soft">Cook on</span>
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            aria-label={`Day to cook ${name}`}
            className="min-w-0 flex-1 bg-transparent text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            if (picked) onList(picked);
          }}
          disabled={!hasIngredients || listing || !picked}
          className="min-h-11 shrink-0 whitespace-nowrap rounded-xl bg-accent px-4 text-[15px] font-bold text-accent-ink disabled:opacity-50"
        >
          {listing ? "Adding…" : "Add to list"}
        </button>
      </div>

      {confirmingRemove ? (
        <div role="group" aria-label="Remove this recipe?" className="flex flex-wrap items-center justify-center gap-2 text-[13px]">
          <span>Remove this recipe?</span>
          <button
            type="button"
            onClick={() => {
              setConfirmingRemove(false);
              onRemove();
            }}
            className={`${pill} border-danger bg-danger text-accent-ink`}
          >
            Remove
          </button>
          <button type="button" onClick={() => setConfirmingRemove(false)} className={`${pill} border-line bg-surface`}>
            Keep it
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-3">
          <button type="button" onClick={onEdit} className={`${quiet} text-ink-soft`}>
            Edit
          </button>
          <button type="button" onClick={() => setConfirmingRemove(true)} className={`${quiet} text-danger`}>
            Remove
          </button>
        </div>
      )}

      {onRevert ? (
        <div className="flex items-center justify-center gap-2 text-[11px]">
          {confirmingRevert ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setConfirmingRevert(false);
                  onRevert();
                }}
                className="min-h-9 px-2 font-semibold underline underline-offset-2"
              >
                Revert — sure?
              </button>
              <button type="button" onClick={() => setConfirmingRevert(false)} className="min-h-9 px-2 text-ink-soft underline underline-offset-2">
                Not now
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingRevert(true)}
              title="Puts back the recipe exactly as it was first imported"
              className="min-h-9 px-2 text-ink-soft underline underline-offset-2"
            >
              Revert to original
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

