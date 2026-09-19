"use client";

import { useState } from "react";
import Provenance from "../Provenance";
import { MACRO_KEYS, MACRO_LABELS, type Macros, type MacroSource } from "@/lib/macros";

type Side = {
  macros: Macros;
  source_url: string | null;
  note: string | null;
  error?: string;
  label: string;
  model: string;
};

type Comparison = {
  id: string;
  name: string;
  baseline: { macros: Macros; source: MacroSource; model: string | null; item_id: string } | null;
  haiku: Side;
  sonnet: Side;
  agreed: boolean;
  disagreements: (keyof Macros)[];
};

/**
 * Run both models on one food and keep the better answer.
 *
 * **Three columns, not two.** What is in your table, what Haiku says, what
 * Sonnet says. Without the first column the harness only ever exercises foods
 * you have never eaten — the ones you eat most, whose numbers matter most to a
 * weekly total, are exactly the ones the cache would hide from comparison.
 *
 * **Column one carries its own provenance, and that is the point.** If the
 * stored figure was itself produced by Haiku three weeks ago then "table versus
 * Haiku" is Haiku-then against Haiku-now — run-to-run variance that looks
 * exactly like agreement. A match against a hand-entered number is evidence; a
 * match against the same model's earlier guess is not.
 */
export default function Harness() {
  const [name, setName] = useState("");
  const [run, setRun] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  async function compare() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    setRun(null);
    setPicked(null);
    try {
      const response = await fetch("/api/debug/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't run that comparison.");
      setRun(body as Comparison);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't run that comparison.");
    } finally {
      setBusy(false);
    }
  }

  async function pick(which: "haiku" | "sonnet" | "baseline") {
    if (!run || busy) return;
    setBusy(true);
    setError(null);
    try {
      const side = which === "baseline" ? null : run[which];
      const response = await fetch("/api/debug/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comparison_id: run.id,
          name: run.name,
          picked: which,
          macros: side ? side.macros : run.baseline?.macros,
          model: side?.model,
          source_url: side?.source_url,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't apply that pick.");
      setPicked(which);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't apply that pick.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <label htmlFor="food" className="text-sm font-medium">
          Which food?
        </label>
        <p className="text-xs text-ink-soft">
          This re-estimates deliberately, even for something already in your log — that is the only
          way to ask whether Haiku reproduces a number you already approved. It is never what
          logging a meal does.
        </p>
        <input
          id="food"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Chick-fil-A #1"
          className="w-full rounded-lg border border-line bg-surface p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <button
          type="button"
          onClick={compare}
          disabled={!name.trim() || busy}
          className="rounded-lg bg-accent px-4 py-3 text-base font-semibold text-accent-ink disabled:opacity-50"
        >
          {busy ? "Running both…" : "Run both models"}
        </button>
        <p className="text-xs text-ink-soft">
          Both run in parallel and neither sees the other. You wait for the slower one, and it costs
          two estimates — which is what a validation window costs.
        </p>
      </section>

      {error ? (
        <p role="alert" className="rounded-lg border border-danger/60 bg-surface p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {run ? (
        <section className="flex flex-col gap-3">
          {run.agreed ? (
            <p className="rounded-lg border border-line bg-surface p-3 text-sm">
              <span className="font-semibold">They agree.</span>{" "}
              <span className="text-ink-soft">
                Recorded as a match — there is nothing to choose between them, so nothing is asked
                of you.
              </span>
            </p>
          ) : (
            <p className="rounded-lg border border-warn/60 bg-surface p-3 text-sm">
              <span className="font-semibold">They disagree</span>
              <span className="text-ink-soft">
                {" "}on {run.disagreements.map((k) => MACRO_LABELS[k].toLowerCase()).join(", ")}.
              </span>
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Column
              title="Your log"
              macros={run.baseline?.macros ?? null}
              empty="Never logged."
              footer={
                run.baseline ? (
                  <Provenance source={run.baseline.source} model={run.baseline.model} />
                ) : null
              }
              caution={
                // The reading that is easy to get wrong, said on the card rather
                // than in a note nobody opens.
                run.baseline && run.baseline.source !== "hand" && run.baseline.model === run.haiku.model
                  ? "This figure came from Haiku too — a match here measures run-to-run variance, not accuracy."
                  : null
              }
              onPick={run.baseline && !run.agreed ? () => pick("baseline") : undefined}
              pickLabel="Keep this"
              pickedNow={picked === "baseline"}
              busy={busy}
            />
            <Column
              title={run.haiku.label}
              macros={run.haiku.error ? null : run.haiku.macros}
              empty={run.haiku.error ?? "No answer."}
              footer={
                run.haiku.error ? null : (
                  <Provenance
                    source={run.haiku.source_url ? "web" : "estimate"}
                    model={run.haiku.model}
                    url={run.haiku.source_url}
                  />
                )
              }
              onPick={run.haiku.error || run.agreed ? undefined : () => pick("haiku")}
              pickLabel="Keep this"
              pickedNow={picked === "haiku"}
              busy={busy}
            />
            <Column
              title={run.sonnet.label}
              macros={run.sonnet.error ? null : run.sonnet.macros}
              empty={run.sonnet.error ?? "No answer."}
              footer={
                run.sonnet.error ? null : (
                  <Provenance
                    source={run.sonnet.source_url ? "web" : "estimate"}
                    model={run.sonnet.model}
                    url={run.sonnet.source_url}
                  />
                )
              }
              onPick={run.sonnet.error || run.agreed ? undefined : () => pick("sonnet")}
              pickLabel="Keep this"
              pickedNow={picked === "sonnet"}
              busy={busy}
            />
          </div>

          {picked ? (
            <p className="text-sm text-ink-soft">
              Recorded. {picked === "baseline"
                ? "Nothing changed — your stored figure stands, and the vote is kept."
                : "The new figure is appended as a correction; the one it beat is still there."}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Column({
  title, macros, empty, footer, caution, onPick, pickLabel, pickedNow, busy,
}: {
  title: string;
  macros: Macros | null;
  empty: string;
  footer: React.ReactNode;
  caution?: string | null;
  onPick?: () => void;
  pickLabel: string;
  pickedNow: boolean;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{title}</h3>

      {macros === null ? (
        <p className="text-sm text-ink-soft">{empty}</p>
      ) : (
        <dl className="flex flex-col gap-1">
          {MACRO_KEYS.map((key) => (
            <div key={key} className="flex items-baseline justify-between gap-2 text-sm">
              <dt className="text-ink-soft">{MACRO_LABELS[key]}</dt>
              <dd className="font-medium tabular-nums">{Math.round(macros[key])}</dd>
            </div>
          ))}
        </dl>
      )}

      {footer}

      {caution ? <p className="text-[11px] text-warn">{caution}</p> : null}

      {onPick ? (
        <button
          type="button"
          onClick={onPick}
          disabled={busy}
          className="mt-auto rounded border border-line px-2 py-1.5 text-sm disabled:opacity-50"
        >
          {pickedNow ? "Kept" : pickLabel}
        </button>
      ) : null}
    </div>
  );
}
