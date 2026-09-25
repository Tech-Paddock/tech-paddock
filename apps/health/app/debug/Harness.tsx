"use client";

import { useState } from "react";
import Provenance from "../Provenance";
import { MACRO_KEYS, MACRO_LABELS, type Macros, type MacroSource } from "@/lib/macros";
import { localDate } from "@/lib/meals";
import type { Judgement } from "@/lib/harness";

type Side = {
  macros?: Macros;
  source_url?: string | null;
  note?: string | null;
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
  verdict: Judgement;
};

const fields = (keys: (keyof Macros)[]) => keys.map((k) => MACRO_LABELS[k].toLowerCase()).join(", ");

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
    // Two paid model calls, both of which may search. Worth one tap to confirm.
    if (!window.confirm(`Run Haiku and Sonnet on "${name.trim()}"? That is two paid model calls.`)) return;
    setBusy(true);
    setError(null);
    setRun(null);
    setPicked(null);
    try {
      const response = await fetch("/api/debug/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, date: localDate(new Date()) }),
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
    // One pick per run; the server refuses a second one too.
    if (!run || busy || picked) return;
    setBusy(true);
    setError(null);
    try {
      // Only the run and the choice: the server reads the numbers from the run.
      const response = await fetch("/api/debug/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comparison_id: run.id, picked: which, date: localDate(new Date()) }),
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
          Both run in parallel and neither sees the other. Each is compared with your stored number
          when there is one. You wait for the slower one, and it costs two paid estimates.
        </p>
      </section>

      {error ? (
        <p role="alert" className="rounded-lg border border-danger/60 bg-surface p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {run ? (
        <section className="flex flex-col gap-3">
          <Summary run={run} />

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
              onPick={run.baseline && run.verdict.needsPick && !picked ? () => pick("baseline") : undefined}
              pickLabel="Keep this"
              pickedNow={picked === "baseline"}
              busy={busy}
            />
            <Column
              title={run.haiku.label}
              macros={run.haiku.macros ?? null}
              empty={run.haiku.error ? `Failed: ${run.haiku.error}` : "No answer."}
              footer={
                !run.haiku.macros ? null : (
                  <Provenance
                    source={run.haiku.source_url ? "web" : "estimate"}
                    model={run.haiku.model}
                    url={run.haiku.source_url}
                  />
                )
              }
              onPick={run.haiku.macros && run.verdict.needsPick && !picked ? () => pick("haiku") : undefined}
              pickLabel="Keep this"
              pickedNow={picked === "haiku"}
              busy={busy}
            />
            <Column
              title={run.sonnet.label}
              macros={run.sonnet.macros ?? null}
              empty={run.sonnet.error ? `Failed: ${run.sonnet.error}` : "No answer."}
              footer={
                !run.sonnet.macros ? null : (
                  <Provenance
                    source={run.sonnet.source_url ? "web" : "estimate"}
                    model={run.sonnet.model}
                    url={run.sonnet.source_url}
                  />
                )
              }
              onPick={run.sonnet.macros && run.verdict.needsPick && !picked ? () => pick("sonnet") : undefined}
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

/**
 * What the run found, in words. A side that failed is named as a failure — it
 * used to read "They disagree on ." with nothing after "on".
 */
function Summary({ run }: { run: Comparison }) {
  const v = run.verdict;
  const lines: { text: string; loud: boolean }[] = [];
  for (const side of v.failed) {
    lines.push({ text: `${run[side].label} failed: ${run[side].error ?? "no answer"}.`, loud: true });
  }
  if (run.baseline) {
    for (const [side, agreesNow, differs] of [
      ["haiku", v.haikuVsBaseline, v.differs.haiku],
      ["sonnet", v.sonnetVsBaseline, v.differs.sonnet],
    ] as const) {
      if (agreesNow === null) continue;
      lines.push(agreesNow
        ? { text: `${run[side].label} reproduces your log.`, loud: false }
        : { text: `${run[side].label} differs from your log on ${fields(differs)}.`, loud: true });
    }
  } else if (v.failed.length === 0) {
    lines.push(v.agreed
      ? { text: "Nothing stored yet, and the two models agree.", loud: false }
      : { text: `Nothing stored yet, and the models differ on ${fields(v.differs.models)}.`, loud: true });
  }

  return (
    <div className={`flex flex-col gap-1 rounded-lg border bg-surface p-3 text-sm ${lines.some((l) => l.loud) ? "border-warn/60" : "border-line"}`}>
      {lines.map((l) => (
        <p key={l.text} className={l.loud ? "font-semibold" : "text-ink-soft"}>{l.text}</p>
      ))}
      <p className="text-ink-soft">
        {v.needsPick ? "Keep one of them below. A run can be picked from once." : "Recorded — there is nothing to choose, so nothing is asked of you."}
      </p>
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
