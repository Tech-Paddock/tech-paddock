"use client";

import { useCallback, useEffect, useState } from "react";
import Provenance from "./Provenance";
import Correction from "./Correction";
import { MACRO_KEYS, MACRO_LABELS, round, total, type Macros, type MacroSource } from "@/lib/macros";
import { MEALS, MEAL_LABELS, localDate, type Meal } from "@/lib/meals";

type DraftItem = {
  name: string;
  quantity: number;
  macros: Macros;
  source: MacroSource;
  model: string | null;
  source_url: string | null;
  note: string | null;
  known: boolean;
  item_id: string | null;
  error: string | null;
  /** Client only: renamed since its lookup, so its numbers are gone until it is looked up again. */
  stale?: boolean;
  /** Client only: the lookup after a rename is in flight. */
  looking?: boolean;
  /** Client only: the quantity as typed, so "0." can become "0.5". */
  quantityText?: string;
};

type Draft = { dictated_text: string; meal: Meal; eaten_on: string; items: DraftItem[] };

type LoggedItem = {
  id: string; name: string; item_id: string; quantity: number;
  macros: Macros; source: MacroSource; model: string | null;
};
type LoggedEntry = { id: string; dictated_text: string; meal: Meal; items: LoggedItem[]; macros: Macros };
type Day = { date: string; entries: LoggedEntry[]; total: Macros };

/**
 * The one screen.
 *
 * Dictate, read what it understood, fix anything wrong, approve. **Approving is
 * the only thing that writes** — the draft is state in this component and
 * nowhere else until you accept it.
 */
export default function Logger() {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [day, setDay] = useState<Day | null>(null);
  const [busy, setBusy] = useState<null | "parsing" | "saving">(null);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<string>("");
  // Which logged line is open for correction. One at a time: two open sheets on
  // the same food could disagree about what the current numbers are.
  const [fixing, setFixing] = useState<string | null>(null);

  // The phone's day, never the server's, and **never fixed at mount**: the
  // home-screen app is resumed from memory the next morning, and a date set
  // once would log breakfast to yesterday. So it is re-read whenever the page
  // comes back into view, and again at the moment of every parse.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") setDate(localDate(new Date()));
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const loadDay = useCallback(async (on: string) => {
    try {
      const response = await fetch(`/api/day?date=${on}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't read today.");
      setDay(body as Day);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read today.");
    }
  }, []);

  useEffect(() => {
    if (date) void loadDay(date);
  }, [date, loadDay]);

  async function parse() {
    if (!text.trim() || busy) return;
    setBusy("parsing");
    setError(null);
    // Computed now rather than read from state, so a page left open overnight
    // still logs to the day you are actually in.
    const now = new Date();
    const today = localDate(now);
    if (today !== date) setDate(today);
    try {
      const response = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, hour: now.getHours(), date: today }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't read that.");
      setDraft(body.draft as Draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that.");
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!draft || busy) return;
    setBusy("saving");
    setError(null);
    try {
      const response = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't log that.");
      setDraft(null);
      setText("");
      const today = localDate(new Date());
      if (today !== date) setDate(today);
      else await loadDay(today);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't log that.");
    } finally {
      setBusy(null);
    }
  }

  function editLine(index: number, change: Partial<DraftItem>) {
    setDraft((current) => {
      if (!current) return current;
      const items = current.items.map((line, i) => {
        if (i !== index) return line;
        // A rename makes this a different food. Its numbers, provenance and item
        // belong to the old name, so all of them go and it is looked up again
        // when you leave the field — never carried across as though typed.
        if (change.name !== undefined && change.name !== line.name) {
          return {
            ...line,
            name: change.name,
            macros: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
            source: "estimate" as MacroSource,
            model: null, source_url: null, note: null,
            known: false, item_id: null, error: null,
            stale: true,
          };
        }
        return {
          ...line,
          ...change,
          // Typing over a number makes it yours, and this is the one place that
          // says so: the server records a number as hand-entered only when the
          // line claims it, and refuses a difference nobody typed.
          ...(change.macros ? { source: "hand" as MacroSource, model: null, source_url: null } : {}),
        };
      });
      return { ...current, items };
    });
  }

  async function lookUpAgain(index: number) {
    const line = draft?.items[index];
    if (!draft || !line?.stale || line.looking) return;
    if (!line.name.trim()) return;
    const eatenOn = draft.eaten_on;
    editLine(index, { looking: true });
    let next: Partial<DraftItem>;
    try {
      const response = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: line.name, quantity: line.quantity, date: eatenOn }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `Couldn't look up "${line.name}".`);
      next = { ...(body.item as DraftItem), quantity: line.quantity };
    } catch (e) {
      next = { error: e instanceof Error ? e.message : `Couldn't look up "${line.name}".` };
    }
    setDraft((current) => {
      if (!current) return current;
      const items = current.items.map((l, i) =>
        // Only land on the line it was asked for — renamed again meanwhile, it
        // is still stale and asks again on its own blur.
        i === index && l.name === line.name ? { ...l, ...next, stale: false, looking: false } : l
      );
      return { ...current, items };
    });
  }

  const unready = draft
    ? draft.items.filter((i) => i.error || i.stale || i.looking || !(i.quantity > 0)).map((i) => i.name)
    : [];

  const draftTotal = draft
    ? round(total(draft.items.filter((i) => !i.error && !i.stale && i.quantity > 0).map((i) => ({ macros: i.macros, quantity: i.quantity }))))
    : null;

  return (
    <div className="flex flex-col gap-5">
      {/* ---------------------------------------------------------------- */}
      {/* Say it */}
      {/* ---------------------------------------------------------------- */}
      <section className="flex flex-col gap-2">
        <label htmlFor="dictation" className="text-sm font-medium">
          What did you eat?
        </label>
        {/* A plain textarea, which is the whole of the dictation feature: the
            iOS keyboard's mic key types into it like any other field. No audio
            capture, no upload, no permission prompt. */}
        <textarea
          id="dictation"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          enterKeyHint="done"
          placeholder="A number one from Chick-fil-A with a large Diet Coke"
          className="w-full resize-y rounded-lg border border-line bg-surface p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <button
          type="button"
          onClick={parse}
          disabled={!text.trim() || busy !== null}
          className="rounded-lg bg-accent px-4 py-3 text-base font-semibold text-accent-ink disabled:opacity-50"
        >
          {busy === "parsing" ? "Working it out…" : "Work out the macros"}
        </button>
      </section>

      {error ? (
        <p role="alert" className="rounded-lg border border-danger/60 bg-surface p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Check it */}
      {/* ---------------------------------------------------------------- */}
      {draft ? (
        <section className="rounded-lg border border-line bg-surface">
          <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            <h2 className="text-sm font-semibold">Before it is logged</h2>
            <select
              id="meal"
              aria-label="Meal"
              value={draft.meal}
              onChange={(e) => setDraft({ ...draft, meal: e.target.value as Meal })}
              className="ml-auto rounded border border-line bg-paper px-2 py-1 text-sm"
            >
              {MEALS.map((m) => (
                <option key={m} value={m}>{MEAL_LABELS[m]}</option>
              ))}
            </select>
          </header>

          <ul className="divide-y divide-line">
            {draft.items.map((line, index) => (
              <li key={index} className="flex flex-col gap-2 p-3">
                <div className="flex items-start gap-2">
                  <input
                    id={`name-${index}`}
                    aria-label="Food"
                    value={line.name}
                    onChange={(e) => editLine(index, { name: e.target.value })}
                    onBlur={() => void lookUpAgain(index)}
                    className="min-w-0 flex-1 rounded border border-line bg-paper px-2 py-1.5 text-base"
                  />
                  <input
                    id={`qty-${index}`}
                    aria-label="How many"
                    type="number"
                    inputMode="decimal"
                    min="0.25"
                    step="0.25"
                    value={line.quantityText ?? String(line.quantity)}
                    // Kept as typed: forcing an empty or "0" field back to 1
                    // made "0.5" impossible to type. A line without a quantity
                    // above zero holds approve instead.
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      editLine(index, { quantityText: e.target.value, quantity: Number.isFinite(n) ? n : 0 });
                    }}
                    className="w-16 shrink-0 rounded border border-line bg-paper px-2 py-1.5 text-base"
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${line.name}`}
                    onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) })}
                    className="shrink-0 rounded border border-line px-2 py-1.5 text-sm text-ink-soft"
                  >
                    ✕
                  </button>
                </div>

                {line.error ? (
                  <p className="text-sm text-danger">{line.error}</p>
                ) : line.stale || line.looking ? (
                  <p className="text-sm text-ink-soft">
                    {line.looking ? "Looking it up…" : "Renamed — it is looked up again when you leave the field."}
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-2">
                      {MACRO_KEYS.map((key) => (
                        <label key={key} className="flex flex-col gap-1 text-[11px] text-ink-soft">
                          {MACRO_LABELS[key]}
                          <input
                            aria-label={`${MACRO_LABELS[key]} for ${line.name}`}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            value={line.macros[key]}
                            onChange={(e) =>
                              editLine(index, { macros: { ...line.macros, [key]: Number(e.target.value) || 0 } })
                            }
                            className="w-full rounded border border-line bg-paper px-2 py-1.5 text-sm text-ink"
                          />
                        </label>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Provenance source={line.source} model={line.model} url={line.source_url} />
                      {line.note ? <span className="text-[11px] text-ink-soft">{line.note}</span> : null}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>

          <footer className="flex flex-wrap items-center gap-3 border-t border-line px-3 py-3">
            {/* A line that failed used to vanish on approve, logging a meal of
                three as two. Approving now waits until every line has numbers. */}
            {unready.length > 0 ? (
              <p className="w-full text-sm text-danger">
                Not ready: {unready.map((n) => `"${n}"`).join(", ")}. Fix or remove {unready.length === 1 ? "it" : "them"} to log.
              </p>
            ) : null}
            {draftTotal ? (
              <p className="text-sm">
                <span className="font-semibold">{draftTotal.kcal} kcal</span>
                <span className="text-ink-soft">
                  {" "}· {draftTotal.protein_g}g protein · {draftTotal.carbs_g}g carbs · {draftTotal.fat_g}g fat
                </span>
              </p>
            ) : null}
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-lg border border-line px-3 py-2 text-sm"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={approve}
                disabled={busy !== null || draft.items.length === 0 || unready.length > 0}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
              >
                {busy === "saving" ? "Logging…" : "Approve and log"}
              </button>
            </div>
          </footer>
        </section>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* The day */}
      {/* ---------------------------------------------------------------- */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">Today</h2>
          {day ? (
            <p className="ml-auto text-sm">
              <span className="font-semibold">{day.total.kcal} kcal</span>
              <span className="text-ink-soft">
                {" "}· {day.total.protein_g}p · {day.total.carbs_g}c · {day.total.fat_g}f
              </span>
            </p>
          ) : null}
        </div>

        {/* An empty day and an unread day must not render the same — that
            defect has appeared three times in Coffee alone. `day` is null until
            the fetch resolves; an empty array is a real answer. */}
        {day === null ? (
          <p className="text-sm text-ink-soft">Reading today…</p>
        ) : day.entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-soft">
            Nothing logged today.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {day.entries.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-line bg-surface p-3">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    {MEAL_LABELS[entry.meal]}
                  </h3>
                  <p className="ml-auto text-sm font-semibold">{entry.macros.kcal} kcal</p>
                </div>
                <ul className="mt-2 flex flex-col gap-2">
                  {entry.items.map((item) => (
                    <li key={item.id} className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <button
                          type="button"
                          onClick={() => setFixing(fixing === item.id ? null : item.id)}
                          aria-expanded={fixing === item.id}
                          className="text-left text-sm underline decoration-dotted underline-offset-2"
                        >
                          {item.quantity !== 1 ? `${item.quantity} × ` : ""}
                          {item.name}
                        </button>
                        <span className="text-sm text-ink-soft">
                          {Math.round(item.macros.kcal * item.quantity)} kcal
                        </span>
                        <span className="ml-auto">
                          <Provenance source={item.source} model={item.model} />
                        </span>
                      </div>

                      {/* The numbers shown are for one of the item; quantity is
                          a property of this line, not of the food, so it is not
                          part of what a correction changes. */}
                      {fixing === item.id ? (
                        <Correction
                          itemId={item.item_id}
                          name={item.name}
                          current={item.macros}
                          onClose={() => setFixing(null)}
                          onSaved={() => {
                            setFixing(null);
                            void loadDay(day.date);
                          }}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
