"use client";

import { useCallback, useEffect, useState } from "react";
import Provenance from "./Provenance";
import { useToast } from "./Toast";
import { MACRO_KEYS, MACRO_LABELS, round, scale, type Macros } from "@/lib/macros";
import { MODELS, DEFAULT_MODEL, type ModelId } from "@/lib/models";
import { methodSteps, perServing, type Recipe, type RecipeDraft, type RecipeOrigin } from "@/lib/recipes";
import { MAX_FILE_BYTES, isFileMediaType, type RecipeFile } from "@/lib/upload";
import { downscale } from "@/lib/image";

/**
 * The book, and the four ways into it. The fourth, a file, arrived 2026-09-22.
 *
 * **Nothing a model wrote is saved until you press Keep it** — generated or read
 * off a page, it is a draft on this screen and a row in the book only after that.
 * That is what keeps "the model wrote something plausible" and "this is how I
 * cook it" from being the same event.
 *
 * **Typing one saves straight away, and that is the exception, added 2026-09-22.**
 * The draft step exists to show you what a model produced before it lands. On the
 * typed path you wrote the recipe, so the only thing the draft adds is the macros
 * — an approval of your own words back. Joel called it ceremony and he is right.
 * **The charter still says all three land as a draft**; correcting it is the
 * technical director's, and the note is in this seat's `HANDOFF.md`.
 *
 * **Adding comes first now, the book underneath.** Joel asked for that on
 * 2026-09-22 along with the tabs: this panel is where you arrive to *do*
 * something, and the book is long enough that a form under it is a form you
 * scroll to find. Collapsed by default, so the book is still what you see.
 */

type Mode = "manual" | "generate" | "import" | "file";

const MODE_LABELS: Record<Mode, string> = {
  manual: "Type it",
  generate: "Ask Claude",
  import: "From a link",
  file: "From a file",
};

/**
 * Turn a chosen file into what the draft route accepts.
 *
 * **Photos are shrunk here, PDFs are sent as they are.** A phone photo is HEIC
 * and several megabytes, and re-encoding it through a canvas makes it a JPEG
 * well under the cap — see `lib/image.ts`. A PDF cannot be shrunk in a browser
 * without a library, so it is checked against the cap and refused with a
 * sentence if it is over, rather than failing at Vercel with an opaque 413.
 */
async function prepareFile(chosen: File): Promise<RecipeFile> {
  const ready = chosen.type === "application/pdf" ? chosen : await downscale(chosen);
  if (!isFileMediaType(ready.type)) {
    throw new Error("That kind of file can't be read. Use a photo or a PDF.");
  }
  if (ready.size > MAX_FILE_BYTES) {
    throw new Error("That file is over 3 MB. A photo of the page, or a shorter PDF, will fit.");
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(ready);
  });
  return { mediaType: ready.type, data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}

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

export default function Book({ onAddedToList }: { onAddedToList?: () => void }) {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  // Only for the read itself. Everything else reports through a toast; a book
  // that could not be read is a state, and it stays on screen while it is true.
  const [readError, setReadError] = useState<string | null>(null);
  const toast = useToast();
  const [busy, setBusy] = useState<null | "drafting" | "keeping">(null);
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);

  const [mode, setMode] = useState<Mode>("manual");
  const [name, setName] = useState("");
  const [servings, setServings] = useState("4");
  const [ingredients, setIngredients] = useState("");
  const [method, setMethod] = useState("");
  const [brief, setBrief] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<(RecipeFile & { name: string }) | null>(null);
  const [preparing, setPreparing] = useState(false);

  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  // The recipe whose ingredients are on their way to the list, if any.
  const [listing, setListing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/recipes", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't read the book.");
      setRecipes(body.recipes as Recipe[]);
      setReadError(null);
    } catch (e) {
      // Deliberately leaves `recipes` null rather than setting it to []. An
      // unread book and an empty book must not render the same.
      setReadError(e instanceof Error ? e.message : "Couldn't read the book.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function makeDraft() {
    if (busy) return;
    setBusy("drafting");
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
            : mode === "import"
              ? { mode, model, url }
              : { mode, model, file: file && { mediaType: file.mediaType, data: file.data } };

      const response = await fetch("/api/recipes/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't draft that.");

      const drafted = body.draft as RecipeDraft;

      // The typed path has nothing to approve: you wrote it, so it goes in.
      // Every other path stops here and waits for Keep it.
      if (mode === "manual") await save(drafted);
      else setDraft(drafted);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't draft that.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Write one draft to the book and reset the form.
   *
   * Takes the draft rather than reading it off state, because the typed path
   * saves one it has just been handed and never puts it on screen.
   */
  async function save(toKeep: RecipeDraft) {
    const response = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: toKeep }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Couldn't save that.");
    setDraft(null);
    setName("");
    setServings("4");
    setIngredients("");
    setMethod("");
    setBrief("");
    setUrl("");
    setFile(null);
    toast.notice(`"${(body.recipe as Recipe).name}" is in the book.`);
    await load();
  }

  async function keepIt() {
    if (!draft || busy) return;
    setBusy("keeping");
    try {
      await save(draft);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusy(null);
    }
  }

  async function toList(recipe: Recipe) {
    // One at a time. A second tap while the first is in flight used to put the
    // ingredients on the list twice (TEC-29 item 8).
    if (listing) return;
    setListing(recipe.id);
    try {
      const response = await fetch("/api/recipes/grocery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recipe.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't add those.");
      toast.notice(`${body.added} ingredient${body.added === 1 ? "" : "s"} added to your list.`);
      onAddedToList?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add those.");
    } finally {
      setListing(null);
    }
  }

  async function remove(recipe: Recipe) {
    try {
      const response = await fetch("/api/recipes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recipe.id }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't remove that.");
      toast.notice(`"${recipe.name}" is out of the book. Your list keeps anything you already added.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove that.");
    }
  }

  /**
   * **Name and ingredients, and deliberately not the method.** "Fry the onion"
   * is in half the book, so matching on it returns half the book. What you search
   * for here is a dish or a thing in the fridge.
   *
   * Filtered in the browser because the whole book is already here. When it stops
   * being, this moves to the query — the shape of the answer does not change.
   */
  const shown = (recipes ?? []).filter((recipe) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      recipe.name.toLowerCase().includes(q) ||
      recipe.ingredients.some((i) => i.toLowerCase().includes(q))
    );
  });

  async function choose(chosen: File | undefined) {
    if (!chosen) return;
    setPreparing(true);
    setFile(null);
    try {
      setFile({ ...(await prepareFile(chosen)), name: chosen.name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally {
      setPreparing(false);
    }
  }

  const ready =
    mode === "manual"
      ? name.trim() !== "" && ingredients.trim() !== "" && Number(servings) >= 1
      : mode === "generate"
        ? brief.trim() !== ""
        : mode === "import"
          ? /^https?:\/\/\S+$/i.test(url.trim())
          : file !== null && !preparing;

  return (
    <div className="flex flex-col gap-8">
      {/* ------------------------------------------------------------------ */}
      {/* Adding one. First on the page, collapsed until you want it.        */}
      {/* ------------------------------------------------------------------ */}
      <section id="add" className="flex scroll-mt-4 flex-col gap-3 rounded-lg border border-line p-3">
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          aria-expanded={adding}
          aria-controls="add-panel"
          className="flex w-full items-center gap-2 text-left"
        >
          <h2 className="text-base font-semibold">Add a recipe</h2>
          <span aria-hidden className="ml-auto text-ink-soft">{adding ? "\u2212" : "+"}</span>
        </button>

        {/* Hidden rather than unmounted: collapsing the panel must not throw away
            a half-typed recipe or a draft you have not decided on yet.
            **The display class has to follow `adding` too.** `hidden` alone lost
            to Tailwind's `flex`, which comes later in the cascade at the same
            specificity, so the panel never closed and the sign flipped for
            nothing — the bug Joel found on 2026-09-22. */}
        <div id="add-panel" hidden={!adding} className={adding ? "flex flex-col gap-3" : "hidden"}>
        <div className="flex flex-wrap items-center gap-2">
          {/* The model picker sits here and nowhere else, because pricing a dish
              is the only judgement in the app. Reading the book calls nothing,
              and neither does keeping a draft. */}
          <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-soft">
            <span>Model</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as ModelId)}
              className="rounded border border-line bg-surface px-2 py-1 text-xs"
            >
              {Object.entries(MODELS).map(([id, spec]) => (
                <option key={id} value={id}>
                  {spec.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Two by two on a phone: four labels in one row would crush "From a
            link" and "From a file" into two lines each. */}
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface p-1 text-sm sm:grid-cols-4">
          {(["manual", "generate", "import", "file"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setDraft(null);
              }}
              className={`rounded px-2 py-2 ${
                mode === m ? "bg-accent font-semibold text-accent-ink" : "text-ink-soft"
              }`}
            >
              {MODE_LABELS[m]}
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
              placeholder={"500g beef mince\n1 tin kidney beans\n2 tbsp olive oil\n\nAmounts matter — the macros are estimated from them"}
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
          </div>
        ) : mode === "import" ? (
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
              out here rather than copied off the page.{" "}
              <b>If the page cannot be read you get an error, not a guess.</b>
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* A label wrapping a hidden input, so the whole box is the tap
                target and it can say what is chosen. No `capture`: on a phone
                that forces the camera, and a screenshot or a PDF is as likely. */}
            <label
              htmlFor="recipe-file"
              className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-line bg-surface p-5 text-center text-sm"
            >
              <span className="font-medium">
                {preparing ? "Getting it ready…" : file ? file.name : "Choose a photo or a PDF"}
              </span>
              <span className="text-xs text-ink-soft">
                {file ? "Tap to choose a different one" : "A cookbook page, a recipe card, a screenshot"}
              </span>
            </label>
            <input
              id="recipe-file"
              type="file"
              accept="image/*,application/pdf"
              className="sr-only"
              onChange={(e) => {
                void choose(e.target.files?.[0]);
                // Cleared so choosing the same file again still fires onChange.
                e.target.value = "";
              }}
            />
            <p className="text-xs text-ink-soft">
              Only the recipe is kept. The file isn&rsquo;t saved anywhere, and any nutrition panel
              in it is ignored: the macros are worked out here.{" "}
              <b>If it can&rsquo;t be read, you get an error, not a guess.</b>
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={makeDraft}
          disabled={!ready || busy !== null}
          className="rounded-lg bg-accent px-4 py-3 text-base font-semibold text-accent-ink disabled:opacity-50"
        >
          {/* **The label says what the press actually does, and that now differs
              by mode.** On the typed path it prices and saves in one go, so
              promising only macros would understate a write. On the other two it
              invents or reads a recipe and then prices it, and nothing is saved
              until Keep it — so it must not say "save". */}
          {busy === "drafting"
            ? "Working it out…"
            : mode === "manual"
              ? "Work out the macros and save"
              : "Work it out"}
        </button>

        {draft ? (
          <section className="rounded-lg border border-accent bg-surface">
            <header className="flex flex-wrap items-baseline gap-2 border-b border-line px-3 py-2">
              <h3 className="text-sm font-semibold">{draft.name}</h3>
              <span className="text-xs text-ink-soft">makes {draft.servings}</span>
              <span className="ml-auto">
                <Provenance source={draft.source} model={draft.model} url={draft.source_url} />
              </span>
            </header>
            <div className="flex flex-col gap-3 p-3">
              <div>
                <h4 className="text-xs font-semibold text-ink-soft">Whole recipe</h4>
                <MacroRow macros={draft.macros} per="in the pot" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-ink-soft">One serving</h4>
                <MacroRow
                  macros={perServing({ ...draft.macros, servings: draft.servings })}
                  per="what a bowl costs you"
                />
              </div>
              {draft.note ? <p className="text-xs text-ink-soft">{draft.note}</p> : null}
              <details>
                <summary className="cursor-pointer text-xs text-ink-soft">
                  {draft.ingredients.length} ingredients{draft.method ? " and the method" : ""}
                </summary>
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {draft.ingredients.map((i, n) => (
                    <li key={n}>{i}</li>
                  ))}
                </ul>
                {methodSteps(draft.method).length > 0 ? (
                  <ol className="mt-2 flex list-inside list-decimal flex-col gap-1.5 text-sm text-ink-soft">
                    {methodSteps(draft.method).map((step, n) => (
                      <li key={n}>{step.replace(/^\d{1,2}[.)]\s*/, "")}</li>
                    ))}
                  </ol>
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
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* The book, under the form now. It is still the reason you came.     */}
      {/* ------------------------------------------------------------------ */}
      {/* Boxed and named "Recipes", Joel on 2026-09-22 — the same frame as the
          panel above, so the page reads as two things rather than one form
          trailing into a list. */}
      <section id="book" className="flex scroll-mt-4 flex-col gap-3 rounded-lg border border-line p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">Recipes</h2>
          {recipes !== null && recipes.length > 0 ? (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              placeholder="Search"
              aria-label="Search your recipes"
              className="ml-auto min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm sm:max-w-56"
            />
          ) : null}
        </div>

        {recipes === null ? (
          readError ? (
            <p role="alert" className="text-sm text-danger">
              {readError}
            </p>
          ) : (
            <p className="text-sm text-ink-soft">Reading the book…</p>
          )
        ) : recipes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-soft">
            Nothing in it yet. Add one above: type it, describe it, or paste a link.
          </p>
        ) : shown.length === 0 ? (
          // Deliberately not the same sentence as an empty book. "Nothing here"
          // and "nothing matched" send you to different next actions.
          <p className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-soft">
            Nothing matches “{query.trim()}”.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shown.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                open={openId === recipe.id}
                onToggle={() => setOpenId(openId === recipe.id ? null : recipe.id)}
                listing={listing === recipe.id}
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
  recipe,
  open,
  listing,
  onToggle,
  onList,
  onRemove,
}: {
  recipe: Recipe;
  open: boolean;
  listing: boolean;
  onToggle: () => void;
  onList: () => void;
  onRemove: () => void;
}) {
  const [count, setCount] = useState("1");
  // **Remove asks first** (TEC-29 item 8): it is permanent, and it sat one tap
  // from Add to list.
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const serving = perServing(recipe);
  const helpings = Number(count);
  const priced = Number.isFinite(helpings) && helpings > 0 ? scale(serving, helpings) : null;

  return (
    <li className="rounded-lg border border-line bg-surface">
      {/* **A lean pill: the name gives way, the facts do not.** `truncate` rather
          than a character count — a count that fits a laptop overflows a phone,
          and this is mostly a phone object. `min-w-0` is what lets the name
          shrink at all inside a flex row, and `shrink-0` on the rest is what
          stops the kcal being the thing that disappears.
          Rating, time, meal, main and cuisine belong in this row too and are not
          here yet: they are columns that do not exist until the metadata change. */}
      <button type="button" onClick={onToggle} className="flex w-full items-baseline gap-2 p-3 text-left">
        <span className="min-w-0 truncate text-sm font-medium">{recipe.name}</span>
        <span className="hidden shrink-0 text-[11px] text-ink-soft sm:inline">
          {ORIGIN_LABELS[recipe.origin]} · makes {recipe.servings}
        </span>
        <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-soft">
          {round(serving).kcal} kcal a serving
        </span>
      </button>

      {open ? (
        <div className="flex flex-col gap-3 border-t border-line p-3">
          <MacroRow macros={serving} per="one serving" />
          <Provenance source={recipe.source} model={recipe.model} url={recipe.source_url} />

          {/* **`recipe.note` is stored and deliberately not shown here.** It is the
              estimate's own caveat — "assumed a tablespoon of oil" — which is what
              you want when deciding whether to keep a number and noise when you
              are cooking. It still renders on the draft, where the deciding
              happens, and it is still on the row for anything that wants it. */}

          {recipe.ingredients.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {recipe.ingredients.map((i, n) => (
                <li key={n}>{i}</li>
              ))}
            </ul>
          ) : null}
          {methodSteps(recipe.method).length > 0 ? (
            <ol className="flex list-inside list-decimal flex-col gap-1.5 text-sm text-ink-soft">
              {methodSteps(recipe.method).map((step, n) => (
                // The marker the author wrote is stripped so the list's own
                // numbering does not print "1. 1. Chop the onion".
                <li key={n}>{step.replace(/^\d{1,2}[.)]\s*/, "")}</li>
              ))}
            </ol>
          ) : null}

          {/* **Pricing helpings, and deliberately not logging them.**
              Multiplying a stored serving is arithmetic in this browser — no
              model, no request, nothing written. Logging what you ate is
              Health's: it reads `GET /api/servings` under the contract in
              `RULES.md` (TEC-11), and this app never writes a log. */}
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                value={count}
                onChange={(e) => setCount(e.target.value)}
                inputMode="decimal"
                aria-label={`Helpings of ${recipe.name}`}
                className="w-16 rounded border border-line bg-surface px-2 py-1.5 text-sm"
              />
              <span className="text-ink-soft">helpings cost</span>
            </label>
            {priced ? (
              <span className="text-sm tabular-nums">
                {round(priced).kcal} kcal · {round(priced).protein_g}g protein
              </span>
            ) : (
              <span className="text-sm text-ink-soft">—</span>
            )}

            <button
              type="button"
              onClick={onList}
              disabled={recipe.ingredients.length === 0 || listing}
              className="ml-auto rounded border border-line px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {listing ? "Adding…" : "Add to list"}
            </button>
            {confirmingRemove ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingRemove(false);
                    onRemove();
                  }}
                  className="rounded border border-danger/60 px-3 py-1.5 text-sm text-danger"
                >
                  Remove — sure?
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(false)}
                  className="rounded border border-line px-3 py-1.5 text-sm text-ink-soft"
                >
                  Keep it
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingRemove(true)}
                className="rounded border border-line px-3 py-1.5 text-sm text-ink-soft"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-[11px] text-ink-soft">
            Pricing helpings reads the numbers above and calls nothing. Removing takes the recipe out
            of the book and leaves your shopping list alone.
          </p>
        </div>
      ) : null}
    </li>
  );
}
