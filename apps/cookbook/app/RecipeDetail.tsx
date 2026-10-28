"use client";

import { useState } from "react";
import MacroTab from "./MacroTab";
import { Stars } from "./Meta";
import { methodSteps, type Recipe, type RecipeOrigin } from "@/lib/recipes";
import { formatMinutes } from "@/lib/metadata";
import { localToday, parseDay } from "@/lib/menuDay";
import {
  RECIPE_TABS,
  addButtonLabel,
  dayChips,
  ratingWords,
  splitIngredient,
  type RecipeTab,
} from "@/lib/recipeView";

/**
 * The open recipe (TEC-183, the owner's canvas): name, origin · makes · time,
 * the rating up top, then Ingredients · Method · Macros as tabs. The keywords
 * (meal, main, cuisine, equipment, diet, tags) are stored and editable in Edit
 * and no longer shown here. Local patterns: the segmented tabs, the numbered
 * circles, the day chips.
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
  const minutes = formatMinutes(recipe.total_minutes);
  const steps = methodSteps(recipe.method);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-bold">{recipe.name}</h3>
        <p className="text-xs text-ink-soft">
          {[ORIGIN_LABELS[recipe.origin], `makes ${recipe.servings}`, minutes].filter(Boolean).join(" · ")}
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
 * **Add to list** (TEC-183): when you are cooking it, as day chips, one primary
 * button naming the day, then Edit and Remove as quiet text. Remove keeps its
 * confirm. The day picked is the day it sits on the menu; a cleared date input
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
  const chips = dayChips(today);
  const [day, setDay] = useState(today);
  const [picking, setPicking] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const picked = parseDay(day);
  const onChip = !picking && chips.some((c) => c.day === day);

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-raised p-3.5">
      <h4 className="text-sm font-bold">When are you cooking it?</h4>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => {
          const on = onChip && c.day === day;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setPicking(false);
                setDay(c.day);
              }}
              className={`min-h-9 rounded-full px-3.5 text-sm font-medium ${
                on ? "bg-accent text-accent-ink" : "border border-line bg-surface"
              }`}
            >
              {c.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={!onChip}
          onClick={() => setPicking(true)}
          className={`min-h-9 rounded-full px-3.5 text-sm font-medium ${
            !onChip ? "bg-accent text-accent-ink" : "border border-line bg-surface"
          }`}
        >
          Pick a date…
        </button>
      </div>
      {!onChip ? (
        <input
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          aria-label={`Day to cook ${name}`}
          className="min-h-11 rounded-lg border border-line bg-surface px-3 text-base"
        />
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (picked) onList(picked);
        }}
        disabled={!hasIngredients || listing || !picked}
        className="min-h-12 w-full rounded-xl bg-accent px-4 text-base font-semibold text-accent-ink disabled:opacity-50"
      >
        {listing ? "Adding…" : picked ? addButtonLabel(picked, today) : "Pick a date"}
      </button>
      <div className="flex items-center justify-center gap-5 text-sm">
        <button type="button" onClick={onEdit} className="min-h-9 text-ink-soft underline-offset-2 hover:underline">
          Edit recipe
        </button>
        {confirmingRemove ? (
          <>
            <button
              type="button"
              onClick={() => {
                setConfirmingRemove(false);
                onRemove();
              }}
              className="min-h-9 font-semibold text-danger"
            >
              Remove — sure?
            </button>
            <button type="button" onClick={() => setConfirmingRemove(false)} className="min-h-9 text-ink-soft">
              Keep it
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingRemove(true)}
            className="min-h-9 text-ink-soft underline-offset-2 hover:underline"
          >
            Remove from book
          </button>
        )}
      </div>
    </div>
  );
}
