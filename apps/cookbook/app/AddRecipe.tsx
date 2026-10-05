"use client";

import { useState } from "react";
import Provenance from "./Provenance";
import MacroRow from "./MacroRow";
import { useToast } from "./Toast";
import { MODELS, DEFAULT_MODEL, type ModelId } from "@/lib/models";
import { methodSteps, perServing, type Recipe, type RecipeDraft } from "@/lib/recipes";
import { MAX_FILE_BYTES, isFileMediaType, type RecipeFile } from "@/lib/upload";
import { MAX_STEER, pileForAsk, turnDown, type TurnedDown } from "@/lib/reroll";
import { downscale } from "@/lib/image";
import { EMPTY_FORM, MetaFields, MetaSummary, Stars, type MetaForm } from "./Meta";
import { PickFields } from "./Tuning";
import { NO_PICKS, hasPicks, type Picks } from "@/lib/tuning";

/**
 * The Add tab: the four ways into the book. The fourth, a file, arrived 2026-09-22.
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
 * **It is a tab of its own now** (Joel, 2026-10-05, overruling the two-tab
 * index): Recipes · Add · King Soopers list. So it is always open — the collapse
 * it had while it sat above the book has nothing left to save room for.
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

export default function AddRecipe({
  onKept,
  cuisines,
}: {
  onKept: (recipe: Recipe) => void;
  /** The cuisines already in the book, offered first in the picker. */
  cuisines: string[];
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<null | "drafting" | "rerolling" | "keeping">(null);
  // "Something else": the drafts turned down since this ask began, and why.
  const [turnedDown, setTurnedDown] = useState<TurnedDown[]>([]);
  const [steer, setSteer] = useState("");
  // The ask the pile was built against — brief and picks; a different ask is a fresh one.
  const [pileBrief, setPileBrief] = useState("");
  // The tuning pickers on Ask Claude, and the same options as filters on the book
  // (Joel, 2026-09-26, "Both"). `lib/tuning.ts` has the rules.
  const [picks, setPicks] = useState<Picks>(NO_PICKS);

  /** Bin it — a turn-down, the same as "Something else" (Joel, 2026-09-25). */
  function binIt() {
    if (draft?.origin === "generated") setTurnedDown(turnDown(turnedDown, draft));
    setDraft(null);
  }
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);

  const [mode, setMode] = useState<Mode>("manual");
  const [name, setName] = useState("");
  const [servings, setServings] = useState("4");
  const [ingredients, setIngredients] = useState("");
  const [method, setMethod] = useState("");
  // Time, meal, main and the rest, typed (TEC-52). Optional, collapsed.
  const [metaForm, setMetaForm] = useState<MetaForm>(EMPTY_FORM);
  const [brief, setBrief] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<(RecipeFile & { name: string }) | null>(null);
  const [preparing, setPreparing] = useState(false);

  const [draft, setDraft] = useState<RecipeDraft | null>(null);

  /**
   * Draft one. **With `reroll`, it is "Something else"** (TEC-39 D): the draft on
   * screen joins the pile turned down this session, and the same brief goes back
   * with the whole pile and the optional reason, so the third reroll avoids both
   * earlier ones. **Bin it turns a draft down too** (Joel, 2026-09-25), so a
   * "Work it out" on the same brief after binning still avoids it; a new brief
   * is a fresh ask and starts a new pile (`pileForAsk`). Nothing is saved until
   * Keep it, and the pile is forgotten on leaving the page.
   */
  async function makeDraft(reroll = false) {
    if (busy) return;
    setBusy(reroll ? "rerolling" : "drafting");

    // Changing a pick is a new ask, the same as changing the brief.
    const ask = `${brief}\n${JSON.stringify(picks)}`;
    const pile: TurnedDown[] =
      reroll && draft
        ? turnDown(turnedDown, draft)
        : mode === "generate"
          ? pileForAsk(turnedDown, pileBrief, ask)
          : [];

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
              meta: metaForm,
            }
          : mode === "generate"
            ? { mode, model, brief, picks, turned_down: pile, steer: reroll ? steer : "" }
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
      // Only once the new draft is here: a reroll that failed leaves the draft
      // you had on screen, and it has not been turned down yet.
      setTurnedDown(pile);
      setPileBrief(ask);
      setSteer("");
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
    // A kept recipe ends the search; the next ask starts with nothing to avoid.
    setTurnedDown([]);
    setSteer("");
    setName("");
    setServings("4");
    setIngredients("");
    setMethod("");
    setMetaForm(EMPTY_FORM);
    setBrief("");
    setPicks(NO_PICKS);
    setUrl("");
    setFile(null);
    toast.notice(`"${(body.recipe as Recipe).name}" is in the book.`);
    onKept(body.recipe as Recipe);
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
        ? brief.trim() !== "" || hasPicks(picks)
        : mode === "import"
          ? /^https?:\/\/\S+$/i.test(url.trim())
          : file !== null && !preparing;

  return (
    <section id="add" className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <h2 className="text-base font-semibold">Add a recipe</h2>
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
          <MetaFields value={metaForm} onChange={setMetaForm} />
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
          {/* Each pick is a requirement, and the draft comes back tagged with
              it — diet only where Claude agrees, with a note where it does not. */}
          <PickFields value={picks} onChange={setPicks} cuisines={cuisines} />
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
        onClick={() => makeDraft()}
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
            {/* What the model said about the dish, to check before keeping it.
                The rating is yours: the model is never asked for one. */}
            <MetaSummary meta={draft.meta} />
            <div className="flex items-center gap-2 text-xs text-ink-soft">
              <span>Your rating (optional)</span>
              <Stars
                rating={draft.meta.rating}
                onRate={(r) => setDraft({ ...draft, meta: { ...draft.meta, rating: r } })}
              />
            </div>
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
          {/* "Something else" only for a recipe Claude wrote: a page or a
              file says what it says, and asking again would read the same. */}
          {draft.origin === "generated" ? (
            <div className="flex flex-col gap-1 border-t border-line px-3 pt-3">
              <input
                value={steer}
                onChange={(e) => setSteer(e.target.value)}
                maxLength={MAX_STEER}
                placeholder="Not this because… (optional)"
                aria-label="Why not this one"
                className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              />
              {turnedDown.length > 0 ? (
                <p className="text-[11px] text-ink-soft">
                  Steering clear of {turnedDown.map((d) => d.name).join(", ")}.
                </p>
              ) : null}
            </div>
          ) : null}
          <footer className="flex flex-wrap gap-2 border-t border-line px-3 py-3">
            <button
              type="button"
              onClick={binIt}
              className="rounded-lg border border-line px-3 py-2 text-sm"
            >
              Bin it
            </button>
            {draft.origin === "generated" ? (
              <button
                type="button"
                onClick={() => makeDraft(true)}
                disabled={busy !== null}
                className="ml-auto rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
              >
                {busy === "rerolling" ? "Thinking again…" : "Something else"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={keepIt}
              disabled={busy !== null}
              className={`${
                draft.origin === "generated" ? "" : "ml-auto "
              }rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50`}
            >
              {busy === "keeping" ? "Saving…" : "Keep it"}
            </button>
          </footer>
        </section>
      ) : null}
    </section>
  );
}
