"use client";

import { DIETS, MEALS, type Diet, type Meal } from "@/lib/metadata";
import { NO_FILTER, TIME_CHOICES, filterActive, type BookFilter, type Picks } from "@/lib/tuning";

/**
 * The tuning section on screen (Joel, 2026-09-26): meal, diet, cuisine and time
 * as pickers on Ask Claude, and the same four plus **High protein** as filters
 * on the book. Rules in `lib/tuning.ts`.
 *
 * **Built from the tokens that exist** — line, surface, accent, ink-soft — so
 * nothing here changes the theme, which is TechPad Gen's. Two patterns are this
 * app's own and flagged as such: the row of compact selects, and the **toggle
 * chip** (High protein) — a bordered pill that fills with the accent when on,
 * `aria-pressed` carrying the state. If another app wants either, that is
 * TechPad Gen's call.
 */

const select = "min-w-0 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm";

/** The four shared selects. `cuisines` are the book's own, offered as suggestions. */
function PickSelects({
  value,
  onChange,
  cuisines,
  idPrefix,
  cuisineAsList,
}: {
  value: Picks;
  onChange: (next: Picks) => void;
  cuisines: string[];
  idPrefix: string;
  /** A filter can only match a cuisine the book has; a picker may ask for a new one. */
  cuisineAsList: boolean;
}) {
  const set = <K extends keyof Picks>(key: K, v: Picks[K]) => onChange({ ...value, [key]: v });
  return (
    <>
      <select
        value={value.meal ?? ""}
        onChange={(e) => set("meal", (e.target.value || null) as Meal | null)}
        aria-label="Meal"
        className={select}
      >
        <option value="">Any meal</option>
        {MEALS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        value={value.diet ?? ""}
        onChange={(e) => set("diet", (e.target.value || null) as Diet | null)}
        aria-label="Diet"
        className={select}
      >
        <option value="">Any diet</option>
        {DIETS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      {cuisineAsList ? (
        <select
          value={value.cuisine ?? ""}
          onChange={(e) => set("cuisine", e.target.value || null)}
          aria-label="Cuisine"
          className={select}
        >
          <option value="">Any cuisine</option>
          {cuisines.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      ) : (
        <>
          <input
            value={value.cuisine ?? ""}
            onChange={(e) => set("cuisine", e.target.value || null)}
            list={`${idPrefix}-cuisines`}
            maxLength={40}
            placeholder="Any cuisine"
            aria-label="Cuisine"
            className={select}
          />
          <datalist id={`${idPrefix}-cuisines`}>
            {cuisines.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </>
      )}
      <select
        value={value.max_minutes ?? ""}
        onChange={(e) => set("max_minutes", e.target.value ? Number(e.target.value) : null)}
        aria-label="Time, start to plate"
        className={select}
      >
        <option value="">Any time</option>
        {TIME_CHOICES.map((m) => (
          <option key={m} value={m}>
            under {m} min
          </option>
        ))}
      </select>
    </>
  );
}

/** On Ask Claude: what the draft must be. Each pick is a requirement and comes back tagged on the draft. */
export function PickFields({
  value,
  onChange,
  cuisines,
}: {
  value: Picks;
  onChange: (next: Picks) => void;
  cuisines: string[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <PickSelects value={value} onChange={onChange} cuisines={cuisines} idPrefix="ask" cuisineAsList={false} />
    </div>
  );
}

/** On the book: narrow what shows. Every filter set must hold; see `matchesFilter`. */
export function BookFilters({
  value,
  onChange,
  cuisines,
}: {
  value: BookFilter;
  onChange: (next: BookFilter) => void;
  cuisines: string[];
}) {
  return (
    <div role="group" aria-label="Filter the book" className="flex flex-wrap items-center gap-2">
      <PickSelects
        value={value}
        onChange={(picks) => onChange({ ...value, ...picks })}
        cuisines={cuisines}
        idPrefix="book"
        cuisineAsList
      />
      <button
        type="button"
        aria-pressed={value.high_protein}
        onClick={() => onChange({ ...value, high_protein: !value.high_protein })}
        title="At least 30% of the calories from protein — worked out from the numbers"
        className={`rounded-full border px-3 py-1.5 text-sm ${
          value.high_protein ? "border-accent bg-accent font-semibold text-accent-ink" : "border-line text-ink-soft"
        }`}
      >
        High protein
      </button>
      {filterActive(value) ? (
        <button type="button" onClick={() => onChange(NO_FILTER)} className="text-sm text-ink-soft underline">
          Clear
        </button>
      ) : null}
    </div>
  );
}
