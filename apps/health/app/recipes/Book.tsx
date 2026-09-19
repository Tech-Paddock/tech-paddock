"use client";

import { useCallback, useEffect, useState } from "react";
import Provenance from "../Provenance";
import { MACRO_KEYS, MACRO_LABELS, round, type Macros } from "@/lib/macros";
import { MEALS, MEAL_LABELS, localDate, mealForHour, type Meal } from "@/lib/meals";
import { MODELS, DEFAULT_MODEL, type ModelId } from "@/lib/models";
import { perServing, type Recipe, type RecipeDraft, type RecipeOrigin } from "@/lib/recipes";

/**
 * Three ways in, one book, and one approval.
 *
 * **Nothing here writes until you press Keep it.** Typed, generated or read off
 * a page, a recipe is a draft on this screen and a row in the book only after
 * that — guardrail 1, the same rule the meal log runs on. It matters more here
 * than it looks: saving a recipe creates a food the whole log will resolve
 * against afterwards, so an unreviewed recipe is a wrong number in every meal
 * that references it.
 */

type Mode = "manual" | "generate" | "import";

const ORIGIN_LABELS: Record<RecipeOrigin, string> = {
  manual: "Yours",
  generated: "Claude's",
  imported: "Imported",
};

function MacroRow({ macros, per }: { macros: Macros; per: string }) {
  const m = round(macros);
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {MACRO_KEYS.map((key) => (
        <div key={key} className="flex items-baseline gap-1">
          <dt className="text-ink-soft">{MACRO_LABELS[key]}</dt>
          <dd className="font-medium tabular-nums">
            {m[key]}
            {key === "kcal" ? "" : "g"}
          </dd>
        </div>
      ))}
      <div className="text-ink-soft">{per}</div>
    </dl>
  );
}

export default function Book() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "drafting" | "keeping" | "logging">(null);
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);

  const [mode, setMode] = useState<Mode>("manual");
  const [name, setName] = useState("");
  const [servings, setServings] = useState("4");
  const [ingredients, setIngredients] = useState("");
  const [method, setMethod] = useState("");
  const [brief, setBrief] = useState("");
  const [url, setUrl] = useState("");

  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/recipes", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't read the book.");
      setRecipes(body.recipes as Recipe[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the book.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function makeDraft() {
    if (busy) return;
    setBusy("drafting");
    setError(null);
    setNotice(null);
    try {
      const payload =
        mode === "manual"
          ? {
              mode,
              model,
              name,
              servings: Number(servings),
              ingredients: ingredients.split("\n").map((l) => l.trim()).filter(Boolean),
              method,
            }
          : mode === "generate"
            ? { mode, model, brief }
            : { mode, model, url };

      const response = await fetch("/api/recipes/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't draft that.");
      setDraft(body.draft as RecipeDraft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't draft that.");
    } finally {
      setBusy(null);
    }
  }

  async function keepIt() {
    if (!draft || busy) return;
    setBusy("keeping");
    setError(null);
    try {
      const response = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft, on_date: localDate(new Date()) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't save that.");
      setDraft(null);
      setName(""); setServings("4"); setIngredients(""); setMethod(""); setBrief(""); setUrl("");
      setNotice(`"${(body.recipe as Recipe).name}" is in the book. You can log it by name now.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusy(null);
    }
  }

  async function logIt(recipe: Recipe, count: number, meal: Meal) {
    if (busy) return;
    setBusy("logging");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/recipes/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: recipe.id,
          servings: count,
          meal,
          eaten_on: localDate(new Date()),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't log that.");
      setNotice(`Logged ${count} serving${count === 1 ? "" : "s"} of ${recipe.name}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't log that.");
    } finally {
      setBusy(null);
    }
  }

  async function toList(recipe: Recipe) {
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/recipes/grocery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recipe.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't add those.");
      setNotice(`${body.added} ingredient${body.added === 1 ? "" : "s"} added to your list.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add those.");
    }
  }

  async function remove(recipe: Recipe) {
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/recipes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recipe.id }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't remove that.");
      setNotice(`"${recipe.name}" is out of the book. Days you already logged are untouched.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove that.");
    }
  }

  const ready =
    mode === "manual"
      ? name.trim() !== "" && ingredients.trim() !== "" && Number(servings) >= 1
      : mode === "generate"
        ? brief.trim() !== ""
        : /^https?:\/\/\S+$/i.test(url.trim());

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Add a recipe</h2>
          {/* The model picker sits here and nowhere else, because this is the
              only judgement in the screen. Reading the book calls nothing. */}
          <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-soft">
            <span>Model</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as ModelId)}
              className="rounded border border-line bg-surface px-2 py-1 text-xs"
            >
              {Object.entries(MODELS).map(([id, spec]) => (
                <option key={id} value={id}>{spec.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex gap-1 rounded-lg border border-line bg-surface p-1 text-sm">
          {(["manual", "generate", "import"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setDraft(null); }}
              className={`flex-1 rounded px-2 py-2 ${
                mode === m ? "bg-accent font-semibold text-accent-ink" : "text-ink-soft"
              }`}
            >
              {m === "manual" ? "Type it" : m === "generate" ? "Ask Claude" : "From a link"}
            </button>
          ))}
        </div>

        {mode === "manual" ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Weeknight chilli"
                aria-label="Recipe name"
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface p-3 text-base"
              />
              <input
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                inputMode="numeric"
                aria-label="Servings"
                className="w-20 shrink-0 rounded-lg border border-line bg-surface p-3 text-base"
              />
            </div>
            <textarea
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
              rows={5}
              placeholder={"500g beef mince\n1 tin kidney beans\n2 tbsp olive oil"}
              aria-label="Ingredients, one per line"
              className="rounded-lg border border-line bg-surface p-3 text-base"
            />
            <textarea
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              rows={3}
              placeholder="How you make it (optional)"
              aria-label="Method"
              className="rounded-lg border border-line bg-surface p-3 text-base"
            />
            <p className="text-xs text-ink-soft">
              The macros come from the ingredients, so amounts are worth writing.
            </p>
          </div>
        ) : mode === "generate" ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={3}
              placeholder="High protein, chicken, under 30 minutes, nothing I have to shop for"
              aria-label="What you feel like"
              className="rounded-lg border border-line bg-surface p-3 text-base"
            />
            <p className="text-xs text-ink-soft">One recipe, then its macros. Nothing is saved yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              inputMode="url"
              placeholder="https://…"
              aria-label="Recipe link"
              className="rounded-lg border border-line bg-surface p-3 text-base"
            />
            <p className="text-xs text-ink-soft">
              Only the recipe is kept — the story and the ads are dropped, and the macros are worked
              out here rather than copied off the page. <b>If the page cannot be read you get an
              error, not a guess.</b>
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={makeDraft}
          disabled={!ready || busy !== null}
          className="rounded-lg bg-accent px-4 py-3 text-base font-semibold text-accent-ink disabled:opacity-50"
        >
          {busy === "drafting" ? "Working it out…" : "Work out the macros"}
        </button>
      </section>

      {error ? (
        <p role="alert" className="rounded-lg border border-danger/60 bg-surface p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-line bg-surface p-3 text-sm text-ink-soft">{notice}</p>
      ) : null}

      {draft ? (
        <section className="rounded-lg border border-accent bg-surface">
          <header className="flex flex-wrap items-baseline gap-2 border-b border-line px-3 py-2">
            <h2 className="text-sm font-semibold">{draft.name}</h2>
            <span className="text-xs text-ink-soft">makes {draft.servings}</span>
            <span className="ml-auto">
              <Provenance source={draft.source} model={draft.model} url={draft.source_url} />
            </span>
          </header>
          <div className="flex flex-col gap-3 p-3">
            <div>
              <h3 className="text-xs font-semibold text-ink-soft">Whole recipe</h3>
              <MacroRow macros={draft.macros} per="in the pot" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-ink-soft">One serving</h3>
              <MacroRow
                macros={perServing({ ...draft.macros, servings: draft.servings })}
                per="what a log line costs"
              />
            </div>
            {draft.note ? <p className="text-xs text-ink-soft">{draft.note}</p> : null}
            <details>
              <summary className="cursor-pointer text-xs text-ink-soft">
                {draft.ingredients.length} ingredients{draft.method ? " and the method" : ""}
              </summary>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {draft.ingredients.map((i, n) => <li key={n}>{i}</li>)}
              </ul>
              {draft.method ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{draft.method}</p>
              ) : null}
            </details>
          </div>
          <footer className="flex gap-2 border-t border-line px-3 py-3">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-lg border border-line px-3 py-2 text-sm"
            >
              Bin it
            </button>
            <button
              type="button"
              onClick={keepIt}
              disabled={busy !== null}
              className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
            >
              {busy === "keeping" ? "Saving…" : "Keep it"}
            </button>
          </footer>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">The book</h2>

        {/* An empty book and an unread book must not render the same. */}
        {recipes === null ? (
          <p className="text-sm text-ink-soft">Reading the book…</p>
        ) : recipes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-soft">
            Nothing in it yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                open={openId === recipe.id}
                busy={busy !== null}
                onToggle={() => setOpenId(openId === recipe.id ? null : recipe.id)}
                onLog={(n, meal) => logIt(recipe, n, meal)}
                onList={() => toList(recipe)}
                onRemove={() => remove(recipe)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RecipeCard({
  recipe, open, busy, onToggle, onLog, onList, onRemove,
}: {
  recipe: Recipe;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onLog: (servings: number, meal: Meal) => void;
  onList: () => void;
  onRemove: () => void;
}) {
  const [count, setCount] = useState("1");
  const [meal, setMeal] = useState<Meal>(() => mealForHour(new Date().getHours()));
  const serving = perServing(recipe);

  return (
    <li className="rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-baseline gap-2 p-3 text-left"
      >
        <span className="text-sm font-medium">{recipe.name}</span>
        <span className="text-[11px] text-ink-soft">
          {ORIGIN_LABELS[recipe.origin]} · makes {recipe.servings}
        </span>
        <span className="ml-auto text-xs tabular-nums text-ink-soft">
          {round(serving).kcal} kcal a serving
        </span>
      </button>

      {open ? (
        <div className="flex flex-col gap-3 border-t border-line p-3">
          <MacroRow macros={serving} per="one serving" />
          <Provenance source={recipe.source} model={recipe.model} url={recipe.source_url} />

          {recipe.note ? <p className="text-xs text-ink-soft">{recipe.note}</p> : null}

          {recipe.ingredients.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {recipe.ingredients.map((i, n) => <li key={n}>{i}</li>)}
            </ul>
          ) : null}
          {recipe.method ? (
            <p className="whitespace-pre-wrap text-sm text-ink-soft">{recipe.method}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <input
              value={count}
              onChange={(e) => setCount(e.target.value)}
              inputMode="decimal"
              aria-label={`Servings of ${recipe.name}`}
              className="w-16 rounded border border-line bg-surface px-2 py-1.5 text-sm"
            />
            <select
              value={meal}
              onChange={(e) => setMeal(e.target.value as Meal)}
              aria-label="Meal"
              className="rounded border border-line bg-surface px-2 py-1.5 text-sm"
            >
              {MEALS.map((m) => <option key={m} value={m}>{MEAL_LABELS[m]}</option>)}
            </select>
            <button
              type="button"
              onClick={() => onLog(Number(count), meal)}
              disabled={busy || !(Number(count) > 0)}
              className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink disabled:opacity-50"
            >
              Log it
            </button>
            <button
              type="button"
              onClick={onList}
              disabled={recipe.ingredients.length === 0}
              className="rounded border border-line px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Add to list
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="ml-auto rounded border border-line px-3 py-1.5 text-sm text-ink-soft"
            >
              Remove
            </button>
          </div>
          <p className="text-[11px] text-ink-soft">
            Logging calls no model — it reads the numbers above. Removing takes the recipe out of the
            book and leaves every day you ate it exactly as it was.
          </p>
        </div>
      ) : null}
    </li>
  );
}
