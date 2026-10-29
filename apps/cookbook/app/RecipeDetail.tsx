"use client";

import { useState } from "react";
import MacroTab from "./MacroTab";
import { Stars } from "./Meta";
import { methodSteps } from "@/lib/recipeSteps";
import type { Recipe, RecipeOrigin } from "@/lib/recipes";
import { timeParts } from "@/lib/metadata";
import { localToday, parseDay } from "@/lib/menuDay";
import { RECIPE_TABS, ratingWords, splitIngredient, type RecipeTab } from "@/lib/recipeView";

/**
 * The open recipe (TEC-183, the owner's canvas): name, origin · makes · time,
 * the rating up top, then Ingredients · Method · Macros as tabs. The keywords
 * (meal, main, cuisine, equipment, diet, tags) are stored and editable in Edit
 * and no longer shown here. Local patterns: the segmented tabs, the numbered
 * circles. Add to list is a date box (TEC-189).
 */

export const ORIGIN_LABELS: Record<RecipeOrigin, string> = {
  manual: "Yours",
  generated: "Claude's",
  imported: "Imported",
};

export function RecipeOpen({
  recipe,
  tab,
  onTab,
  onRate,
  rating,
}: {
  recipe: Recipe;
  tab: RecipeTab;
  onTab: (tab: RecipeTab) => void;
  onRate: (value: number | null) => void;
  /** True while a rating is being saved. */
  rating: boolean;
}) {
  const steps = methodSteps(recipe.method);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-bold">{recipe.name}</h3>
        <p className="text-xs text-ink-soft">
          {[ORIGIN_LABELS[recipe.origin], ...timeParts(recipe), `makes ${recipe.servings}`].join(" · ")}
        </p>
        <div className="flex items-center gap-2">
          <Stars rating={recipe.rating} onRate={onRate} busy={rating} size="text-2xl" />
          <span className="text-xs text-ink-soft">{ratingWords(recipe.rating)}</span>
        </div>
      </div>

      <div role="tablist" aria-label="Recipe sections" className="flex gap-1 rounded-xl bg-raised p-1">
        {RECIPE_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${recipe.id}-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${recipe.id}-${t.key}`}
            onClick={() => onTab(t.key)}
            className={`min-h-10 flex-1 rounded-lg px-2 text-sm font-semibold ${
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
                const { amount, text } = splitIngredient(line);
                return (
                  <li key={n} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 border-t border-line/40 py-2 first:border-t-0">
                    {amount ? (
                      <>
                        <span className="font-semibold tabular-nums">{amount}</span>
                        <span>{text}</span>
                      </>
                    ) : (
                      <span className="col-span-2">{line}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-soft">No ingredients.</p>
          )
        ) : tab === "method" ? (
          steps.length > 0 ? (
            <ol className="flex flex-col gap-3 text-sm">
              {steps.map((step, n) => (
                <li key={n} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-raised text-xs font-bold tabular-nums"
                  >
                    {n + 1}
                  </span>
                  {/* The marker the author wrote is stripped so the circle's
                      number does not print beside "1. Chop the onion". */}
                  <span className="pt-0.5">{step.replace(/^\d{1,2}[.)]\s*/, "")}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-ink-soft">No method.</p>
          )
        ) : (
          <MacroTab recipe={recipe} />
        )}
      </div>
    </div>
  );
}


/**
 * **Add to list** (TEC-183; the day became one date box in TEC-189): "When are
 * you cooking it?" is a single date input that opens on today, with Add to list
 * beside it; the day picked is the day it sits on the menu. Edit and Remove sit
 * under it as outlined buttons, and Remove keeps its confirm. A cleared date
 * disables the button instead of quietly meaning "today".
 */
export function AddToListCard({
  name,
  hasIngredients,
  listing,
  onList,
  onEdit,
  onRemove,
  today = localToday(),
}: {
  name: string;
  hasIngredients: boolean;
  listing: boolean;
  onList: (day: string) => void;
  onEdit: () => void;
  onRemove: () => void;
  /** Injected by the tests; the browser's own today otherwise. */
  today?: string;
}) {
  const [day, setDay] = useState(today);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const picked = parseDay(day);
  const outline = "min-h-11 rounded-xl border border-line px-4 text-base";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2.5 rounded-xl bg-raised p-3">
        <h4 className="text-sm font-bold">When are you cooking it?</h4>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            aria-label={`Day to cook ${name}`}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-base"
          />
          <button
            type="button"
            onClick={() => {
              if (picked) onList(picked);
            }}
            disabled={!hasIngredients || listing || !picked}
            className="min-h-11 shrink-0 rounded-xl bg-accent px-4 text-base font-semibold text-accent-ink disabled:opacity-50"
          >
            {listing ? "Adding…" : "Add to list"}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onEdit} className={outline}>
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
              className={`${outline} font-semibold text-danger`}
            >
              Remove — sure?
            </button>
            <button type="button" onClick={() => setConfirmingRemove(false)} className={`${outline} text-ink-soft`}>
              Keep it
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmingRemove(true)} className={`${outline} text-danger`}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
