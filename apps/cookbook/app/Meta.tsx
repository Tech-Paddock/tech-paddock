"use client";

import { DIETS, MEALS, formatMinutes, type RecipeMeta } from "@/lib/metadata";

/**
 * Recipe metadata on screen (TEC-52): the rating control, the typed form's
 * fields, and the summary on a draft or an open card.
 *
 * **Built from the tokens that exist** — accent, line, ink-soft — so nothing
 * here changes the theme, which is TechPad Gen's. The stars are this app's own
 * pattern, not a shared one; if another app wants them, that is TechPad Gen's
 * call.
 */

/**
 * One to five, Joel's. Tapping the rating it already has clears it, so a
 * mis-tap is undone by the same tap. `onRate` absent means read-only.
 */
export function Stars({
  rating,
  onRate,
  busy = false,
  size = "text-base",
}: {
  rating: number | null;
  onRate?: (rating: number | null) => void;
  busy?: boolean;
  size?: string;
}) {
  if (!onRate) {
    return rating ? (
      <span aria-label={`Rated ${rating} of 5`} className="text-accent">
        {"★".repeat(rating)}
      </span>
    ) : null;
  }
  return (
    <span role="group" aria-label="Your rating" className={`inline-flex ${size} leading-none`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={busy}
          onClick={() => onRate(rating === n ? null : n)}
          aria-label={rating === n ? `Clear the rating of ${n}` : `Rate ${n} of 5`}
          aria-pressed={rating !== null && n <= rating}
          className={`px-0.5 py-1 disabled:opacity-50 ${rating !== null && n <= rating ? "text-accent" : "text-line"}`}
        >
          {"★"}
        </button>
      ))}
    </span>
  );
}

/** The typed form's metadata, as the strings a form holds. The server reads them with `readMeta`. */
export type MetaForm = {
  total_minutes: string;
  meal: string;
  mains: string;
  cuisine: string;
  equipment: string;
  diet: string[];
  tags: string;
  rating: number | null;
};

export const EMPTY_FORM: MetaForm = {
  total_minutes: "",
  meal: "",
  mains: "",
  cuisine: "",
  equipment: "",
  diet: [],
  tags: "",
  rating: null,
};

/** A stored recipe's metadata as the form holds it — what the editor opens with. */
export function formFromMeta(meta: RecipeMeta): MetaForm {
  return {
    total_minutes: meta.total_minutes ? String(meta.total_minutes) : "",
    meal: meta.meal ?? "",
    mains: meta.mains.join(", "),
    cuisine: meta.cuisine ?? "",
    equipment: meta.equipment.join(", "),
    diet: [...meta.diet],
    tags: meta.tags.join(", "),
    rating: meta.rating,
  };
}

const input = "min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm";

/**
 * All optional, and collapsed: a typed recipe is still a name and its
 * ingredients. **No allergen or "-free" box, and no nutrition tag** — both were
 * agreed not to exist (see `lib/metadata.ts`), and the server drops either if
 * one is typed into Tags.
 */
export function MetaFields({
  value,
  onChange,
  open = false,
}: {
  value: MetaForm;
  onChange: (next: MetaForm) => void;
  /** Open to begin with — the editor, where the details are half of what you came to change. */
  open?: boolean;
}) {
  const set = <K extends keyof MetaForm>(key: K, v: MetaForm[K]) => onChange({ ...value, [key]: v });
  return (
    <details open={open} className="rounded-lg border border-line bg-surface">
      <summary className="cursor-pointer px-3 py-2 text-sm text-ink-soft">Details (optional)</summary>
      <div className="grid grid-cols-2 gap-2 p-3 pt-1">
        <input
          value={value.total_minutes}
          onChange={(e) => set("total_minutes", e.target.value)}
          inputMode="numeric"
          placeholder="Minutes, start to plate"
          aria-label="Total minutes"
          className={input}
        />
        <select
          value={value.meal}
          onChange={(e) => set("meal", e.target.value)}
          aria-label="Meal"
          className={input}
        >
          <option value="">Meal</option>
          {MEALS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          value={value.mains}
          onChange={(e) => set("mains", e.target.value)}
          placeholder="Main: chicken, lentils"
          aria-label="Main ingredients, comma separated"
          className={input}
        />
        <input
          value={value.cuisine}
          onChange={(e) => set("cuisine", e.target.value)}
          placeholder="Cuisine"
          aria-label="Cuisine"
          className={input}
        />
        <input
          value={value.equipment}
          onChange={(e) => set("equipment", e.target.value)}
          placeholder="Equipment: oven, slow cooker"
          aria-label="Equipment, comma separated"
          className={`${input} col-span-2`}
        />
        <input
          value={value.tags}
          onChange={(e) => set("tags", e.target.value)}
          placeholder="Tags: one-pot, freezer"
          aria-label="Tags, comma separated"
          className={`${input} col-span-2`}
        />
        <div className="col-span-2 flex flex-wrap items-center gap-3 text-sm">
          {DIETS.map((d) => (
            <label key={d} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={value.diet.includes(d)}
                onChange={(e) =>
                  set("diet", e.target.checked ? [...value.diet, d] : value.diet.filter((x) => x !== d))
                }
              />
              {d}
            </label>
          ))}
          <span className="ml-auto">
            <Stars rating={value.rating} onRate={(r) => set("rating", r)} />
          </span>
        </div>
      </div>
    </details>
  );
}

/**
 * The metadata as one quiet line — on a draft, so you can see what the model
 * said before you keep it, and on an open card. Nothing when nothing is set.
 */
export function MetaSummary({ meta }: { meta: RecipeMeta }) {
  const parts = [
    formatMinutes(meta.total_minutes),
    meta.meal,
    meta.mains.length ? meta.mains.join(", ") : null,
    meta.cuisine,
    meta.equipment.length ? meta.equipment.join(", ") : null,
    meta.diet.length ? meta.diet.join(", ") : null,
  ].filter(Boolean);
  if (parts.length === 0 && meta.tags.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 text-xs text-ink-soft">
      {parts.length ? <p>{parts.join(" · ")}</p> : null}
      {meta.tags.length ? (
        <ul className="flex flex-wrap gap-1">
          {meta.tags.map((t) => (
            <li key={t} className="rounded border border-line px-1.5 py-0.5 text-[11px]">
              {t}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
