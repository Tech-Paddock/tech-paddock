"use client";

import { useEffect, useState } from "react";
import Provenance from "./Provenance";
import { MACRO_KEYS, MACRO_LABELS, type Macros, type MacroSource } from "@/lib/macros";
import { localDate } from "@/lib/meals";

type Version = Macros & {
  id: string;
  kind: "correction" | "change";
  effective_from: string;
  source: MacroSource;
  model: string | null;
  note: string | null;
  created_at: string;
};

/**
 * Fixing a food's numbers, after it has already been logged.
 *
 * **The choice between the two kinds is the whole of this sheet**, and it is
 * put as a question about the food rather than as a database word, because that
 * is the only form in which the answer is knowable:
 *
 * - *The number was wrong* — a correction. The common case, and the default.
 * - *The food itself changed* — a change. It needs the date the food changed,
 *   not today's date, or the boundary is in the wrong place and the boundary is
 *   the only thing a change means.
 *
 * **Neither moves a day already logged** (TEC-21): every logged line keeps the
 * numbers it was logged with, this line included. What the kind decides is
 * which figure a later log of an earlier date picks up, and what a backfill
 * would read to tell a day that was wrong from one that was right at the time.
 *
 * Nothing here overwrites. Every save appends, and the history below is what
 * makes that checkable rather than a promise.
 */
export default function Correction({
  itemId,
  name,
  current,
  onClose,
  onSaved,
}: {
  itemId: string;
  name: string;
  current: Macros;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [macros, setMacros] = useState<Macros>(current);
  const [kind, setKind] = useState<"correction" | "change">("correction");
  const [date, setDate] = useState(localDate(new Date()));
  const [history, setHistory] = useState<Version[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const response = await fetch(`/api/items/version?item_id=${itemId}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Couldn't read the history.");
        if (live) setHistory(body.versions as Version[]);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Couldn't read the history.");
      }
    })();
    return () => { live = false; };
  }, [itemId]);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/items/version", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, macros, kind, date }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't record that.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't record that.");
    } finally {
      setBusy(false);
    }
  }

  const unchanged = MACRO_KEYS.every((k) => macros[k] === current[k]);

  return (
    <div className="flex flex-col gap-3 border-t border-line bg-raised p-3">
      <div className="flex items-baseline gap-2">
        <h4 className="text-sm font-semibold">Fix {name}</h4>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-sm text-ink-soft underline decoration-dotted underline-offset-2"
        >
          Close
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {MACRO_KEYS.map((key) => (
          <label key={key} className="flex flex-col gap-1 text-[11px] text-ink-soft">
            {MACRO_LABELS[key]}
            <input
              aria-label={`${MACRO_LABELS[key]} for ${name}`}
              type="number"
              inputMode="decimal"
              min="0"
              value={macros[key]}
              onChange={(e) => setMacros({ ...macros, [key]: Number(e.target.value) || 0 })}
              className="w-full rounded border border-line bg-paper px-2 py-1.5 text-sm text-ink"
            />
          </label>
        ))}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[11px] text-ink-soft">Which is it?</legend>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="kind"
            value="correction"
            checked={kind === "correction"}
            onChange={() => setKind("correction")}
            className="mt-1"
          />
          <span>
            The number was wrong.
            <span className="block text-[11px] text-ink-soft">
              Used from your next log on. Days already logged keep their numbers.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="kind"
            value="change"
            checked={kind === "change"}
            onChange={() => setKind("change")}
            className="mt-1"
          />
          <span>
            The food itself changed.
            <span className="block text-[11px] text-ink-soft">
              Used for anything eaten from that date. Earlier dates keep the old numbers.
            </span>
          </span>
        </label>
      </fieldset>

      {kind === "change" ? (
        <label className="flex flex-col gap-1 text-[11px] text-ink-soft">
          Changed on — the date the food changed, not today
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-line bg-paper px-2 py-1.5 text-sm text-ink"
          />
        </label>
      ) : null}

      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}

      <button
        type="button"
        onClick={save}
        disabled={busy || unchanged}
        className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
      >
        {busy ? "Recording…" : unchanged ? "Change a number first" : "Record it"}
      </button>

      {/* The append-only guarantee, made checkable. */}
      <div className="flex flex-col gap-1">
        <h5 className="text-[11px] uppercase tracking-wide text-ink-soft">History</h5>
        {history === null ? (
          <p className="text-[11px] text-ink-soft">Reading…</p>
        ) : history.length === 0 ? (
          <p className="text-[11px] text-ink-soft">No versions recorded.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {[...history].reverse().map((v) => (
              <li key={v.id} className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
                <span className="font-medium tabular-nums">{Math.round(Number(v.kcal))} kcal</span>
                <span className="text-ink-soft">
                  {v.kind === "change" ? "changed" : "corrected"} · from {v.effective_from}
                </span>
                <span className="ml-auto">
                  <Provenance source={v.source} model={v.model} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
