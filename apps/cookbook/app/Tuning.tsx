"use client";

import { DIETS, MEALS, type Diet, type Meal } from "@/lib/metadata";
import { NO_FILTER, TIME_CHOICES, filterActive, type BookFilter, type Picks } from "@/lib/tuning";

/**
 * The tuning section on screen (2026-09-26): meal, diet, cuisine and time
 * as pickers on Ask Claude, and the same four as filters on the book (High
 * protein was dropped from the book in TEC-189). Rules in `lib/tuning.ts`.
 *
 * **Built from the tokens that exist** — line, surface, ink-soft — so nothing
 * here changes the theme, which is TechPad Gen's. The row of compact selects is
 * this app's own pattern; on the book it is one row of four at 360px.
 */

const select = "w-full min-w-0 rounded-lg border border-line bg-surface px-1.5 py-1.5 text-[13px]";

/** The four shared selects. `cuisines` are the book's own, offered as suggestions. */
function PickSelects({
  value,
  onChange,
  cuisines,
  idPrefix,
  cuisineAsList,
  bare = false,
}: {
  value: Picks;
  onChange: (next: Picks) => void;
  cuisines: string[];
  idPrefix: string;
  /** A filter can only match a cuisine the book has; a picker may ask for a new one. */
  cuisineAsList: boolean;
  /** Short labels ("Meal", "<30 min") for the book's one row of four at 360px. */
  bare?: boolean;
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
        <option value="">{bare ? "Meal" : "Any meal"}</option>
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
        <option value="">{bare ? "Diet" : "Any diet"}</option>
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
          <option value="">{bare ? "Cuisine" : "Any cuisine"}</option>
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
        <option value="">{bare ? "Time" : "Any time"}</option>
        {TIME_CHOICES.map((m) => (
          <option key={m} value={m}>
            {bare ? `<${m} min` : `under ${m} min`}
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
    <div role="group" aria-label="Filter the book" className="flex flex-col gap-1">
      {/* One row of four (TEC-189): Meal, Diet, Cuisine, Time. */}
      <div className="grid grid-cols-4 gap-1.5">
        <PickSelects value={value} onChange={onChange} cuisines={cuisines} idPrefix="book" cuisineAsList bare />
      </div>
      {filterActive(value) ? (
        <button type="button" onClick={() => onChange(NO_FILTER)} className="self-start text-sm text-ink-soft underline">
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
