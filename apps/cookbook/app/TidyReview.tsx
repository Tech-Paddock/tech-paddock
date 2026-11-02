"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "./Toast";
import type { TidyDraftView } from "@/lib/tidy";
import { keepSummary, servingsInput, tidySummary } from "@/lib/tidyView";

/**
 * Tidy and its review screen (TEC-201), at the top of the Recipes tab.
 *
 * **Drafts, one recipe at a time, from the browser.** Tidy makes a draft per
 * request, with a progress count, so no request runs long; the drafts are stored,
 * so the review is still here after a reload. **A draft never changes a recipe**:
 * only Keep does, and Keep prices the recipe at once.
 *
 * **The review is one screen**: before and after for each recipe, all ticked,
 * with **Keep all**. Servings Tidy had to guess are marked and can be changed
 * before keeping. Shown only while drafts exist; the Tidy button shows only while
 * recipes are not in the house style yet.
 *
 * Local patterns, from the app's existing look: the card on `bg-surface`, the
 * progress bar (a thin `bg-raised` track with an accent fill, as the macro split
 * bar), the sticky action bar.
 */

type Todo = { id: string; name: string };
type Data = { drafts: TidyDraftView[]; todo: Todo[] };
type Run = { kind: "tidy" | "keep"; done: number; total: number };
type Failure = { name: string; reason: string };

const outline = "min-h-11 rounded-xl border border-line px-4 text-base";
const primary = "min-h-11 rounded-xl bg-accent px-4 text-base font-semibold text-accent-ink disabled:opacity-50";

export default function TidyReview({
  onChanged,
  refreshKey = 0,
}: {
  /** The book changed (a tidy was kept): read it again. */
  onChanged: () => void;
  /** Bumped when the book changes elsewhere, so the count of recipes to tidy follows. */
  refreshKey?: number;
}) {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const stop = useRef(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/recipes/tidy", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't read the tidy drafts.");
      setData({ drafts: body.drafts as TidyDraftView[], todo: body.todo as Todo[] });
    } catch (e) {
      // Stays quiet on the page (the book has its own read error); a toast says why Tidy is missing.
      toast.error(e instanceof Error ? e.message : "Couldn't read the tidy drafts.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!run) void load();
  }, [load, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Make a draft for every recipe not yet in the house style, one at a time. */
  async function tidyAll() {
    if (!data || run) return;
    const queue = [...data.todo];
    stop.current = false;
    setFailures([]);
    let made = 0;
    const failed: Failure[] = [];
    setRun({ kind: "tidy", done: 0, total: queue.length });

    for (const [n, item] of queue.entries()) {
      if (stop.current) break;
      try {
        const response = await fetch("/api/recipes/tidy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Couldn't tidy that.");
        made++;
        setData((d) =>
          d ? { drafts: [...d.drafts.filter((x) => x.id !== item.id), body.draft as TidyDraftView], todo: d.todo.filter((t) => t.id !== item.id) } : d
        );
      } catch (e) {
        failed.push({ name: item.name, reason: e instanceof Error ? e.message : "Couldn't tidy that." });
      }
      setRun({ kind: "tidy", done: n + 1, total: queue.length });
    }

    setFailures(failed);
    setRun(null);
    toast.notice(tidySummary(made, failed.length, stop.current));
  }

  /** Keep these drafts, one request each: the write, and the recipe priced at once. */
  async function keep(ids: string[]) {
    if (!data || run || ids.length === 0) return;
    stop.current = false;
    setFailures([]);
    let kept = 0;
    let notEstimated = 0;
    const failed: Failure[] = [];
    setRun({ kind: "keep", done: 0, total: ids.length });

    for (const [n, id] of ids.entries()) {
      if (stop.current) break;
      const draft = data.drafts.find((d) => d.id === id);
      try {
        const sent = draft?.servings_estimated ? servingsInput(edits[id] ?? String(draft.after.servings)) : null;
        const response = await fetch("/api/recipes/tidy/keep", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...(sent ? { servings: sent } : {}) }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Couldn't keep that.");
        kept++;
        if (body.estimated === false) notEstimated++;
        setData((d) => (d ? { ...d, drafts: d.drafts.filter((x) => x.id !== id) } : d));
      } catch (e) {
        failed.push({ name: draft?.name ?? "A recipe", reason: e instanceof Error ? e.message : "Couldn't keep that." });
      }
      setRun({ kind: "keep", done: n + 1, total: ids.length });
    }

    setFailures(failed);
    setRun(null);
    if (kept > 0) onChanged();
    const text = keepSummary(kept, notEstimated, failed.length);
    if (failed.length > 0 || notEstimated > 0) toast.error(text);
    else toast.notice(text);
  }

  async function discard(ids: string[]) {
    if (ids.length === 0 || run) return;
    try {
      const response = await fetch("/api/recipes/tidy", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't discard those.");
      toast.notice(`${ids.length} draft${ids.length === 1 ? "" : "s"} thrown away. The recipes are as they were.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't discard those.");
    }
  }

  if (!data) return null;
  const drafts = data.drafts;
  const tickedIds = drafts.filter((d) => !unticked.has(d.id)).map((d) => d.id);

  return (
    <div className="flex flex-col gap-2">
      {run ? <Progress run={run} onStop={() => (stop.current = true)} /> : null}

      {!run && data.todo.length > 0 ? (
        <section aria-label="Tidy" className="flex flex-col gap-2 rounded-xl bg-surface p-3">
          <h3 className="text-sm font-bold">Tidy the book</h3>
          <p className="text-[13px] text-ink-soft">
            {data.todo.length} recipe{data.todo.length === 1 ? "" : "s"} {data.todo.length === 1 ? "isn't" : "aren't"} in
            the house style yet: ingredients are just ingredients, the prep moves into the method, and each unit has one
            spelling. Claude writes a draft of each for you to review. Nothing changes until you keep it.
          </p>
          <button type="button" onClick={tidyAll} className={primary}>
            Tidy {data.todo.length} recipe{data.todo.length === 1 ? "" : "s"}
          </button>
        </section>
      ) : null}

      {failures.length > 0 ? (
        <details className="rounded-xl bg-surface p-3 text-[13px]" open>
          <summary className="cursor-pointer font-semibold text-danger">
            {failures.length} couldn&rsquo;t be done
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {failures.map((f, n) => (
              <li key={n}>
                <b>{f.name}</b> <span className="text-ink-soft">{f.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {drafts.length > 0 ? (
        <section aria-label="Review tidied recipes" className="flex flex-col gap-2">
          <div className="flex flex-col gap-1 px-2">
            <h3 className="text-base font-bold">Review</h3>
            <p className="text-[13px] text-ink-soft">
              {drafts.length} tidied recipe{drafts.length === 1 ? "" : "s"}, before and after. Untick any you
              don&rsquo;t want. Keeping one estimates its macros at once.
            </p>
          </div>
          <ReviewList
            drafts={drafts}
            unticked={unticked}
            edits={edits}
            openId={openId}
            onTick={(id, on) =>
              setUnticked((s) => {
                const next = new Set(s);
                if (on) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onEdit={(id, text) => setEdits((e) => ({ ...e, [id]: text }))}
            onOpen={(id) => setOpenId((cur) => (cur === id ? null : id))}
          />
          <div className="sticky bottom-2 flex flex-wrap gap-2 rounded-xl border border-line bg-raised p-2">
            <button
              type="button"
              disabled={run !== null}
              onClick={() => keep(drafts.map((d) => d.id))}
              className={`${primary} flex-1`}
            >
              Keep all ({drafts.length})
            </button>
            <button
              type="button"
              disabled={run !== null || tickedIds.length === 0}
              onClick={() => keep(tickedIds)}
              className={`${outline} flex-1 disabled:opacity-50`}
            >
              Keep ticked ({tickedIds.length})
            </button>
            <button
              type="button"
              disabled={run !== null || tickedIds.length === 0}
              onClick={() => discard(tickedIds)}
              className={`${outline} text-ink-soft disabled:opacity-50`}
            >
              Discard ticked
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Progress({ run, onStop }: { run: Run; onStop: () => void }) {
  const pct = run.total > 0 ? Math.round((run.done / run.total) * 100) : 0;
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface p-3" role="status">
      <p className="text-sm font-semibold">
        {run.kind === "tidy" ? "Tidying" : "Keeping"} {Math.min(run.done + 1, run.total)} of {run.total}…
      </p>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-raised" aria-hidden="true">
        <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <button type="button" onClick={onStop} className={`${outline} self-start text-ink-soft`}>
        Stop after this one
      </button>
    </div>
  );
}

/**
 * The drafts as a list: a tick, the name, and the servings line when Tidy had to
 * guess it. Presentational, so the tests render it without a browser.
 */
export function ReviewList({
  drafts,
  unticked,
  edits,
  openId,
  onTick,
  onEdit,
  onOpen,
}: {
  drafts: TidyDraftView[];
  unticked: Set<string>;
  edits: Record<string, string>;
  openId: string | null;
  onTick: (id: string, on: boolean) => void;
  onEdit: (id: string, text: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {drafts.map((d) => {
        const open = openId === d.id;
        const text = edits[d.id] ?? String(d.after.servings);
        return (
          <li key={d.id} className="overflow-hidden rounded-xl bg-surface">
            <div className="flex items-center gap-1 pl-1 pr-3">
              <label className="flex min-h-11 min-w-11 items-center justify-center">
                <input
                  type="checkbox"
                  checked={!unticked.has(d.id)}
                  onChange={(e) => onTick(d.id, e.target.checked)}
                  aria-label={`Keep ${d.name}`}
                  className="size-6 accent-accent"
                />
              </label>
              <button
                type="button"
                onClick={() => onOpen(d.id)}
                aria-expanded={open}
                className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center py-1 text-left"
              >
                <span className="w-full truncate text-[15px] font-semibold">{d.name}</span>
                <span className="text-xs text-ink-soft">
                  {d.after.ingredients.length} ingredients · {open ? "hide" : "see"} before and after
                </span>
              </button>
            </div>
            {d.servings_estimated ? (
              <label className="flex flex-wrap items-center gap-2 border-t border-line/40 px-3 py-2 text-xs text-ink-soft">
                <span>
                  <b className="text-ink">Servings estimated</b>
                  {d.before.yield_text ? ` (it said "${d.before.yield_text}")` : " (it gave none)"}. Change it if it
                  looks wrong:
                </span>
                <input
                  value={text}
                  onChange={(e) => onEdit(d.id, e.target.value)}
                  inputMode="numeric"
                  aria-label={`Servings for ${d.name}`}
                  className="w-16 rounded-lg border border-line bg-surface p-2 text-base text-ink"
                />
              </label>
            ) : null}
            {open ? (
              <div className="flex flex-col gap-4 border-t border-line/40 px-3.5 py-3">
                <Version label="Before" ingredients={d.before.ingredients} method={d.before.method} />
                <Version label="After" ingredients={d.after.ingredients} method={d.after.method} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function Version({ label, ingredients, method }: { label: string; ingredients: string[]; method: string | null }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{label}</h4>
      <ul className="flex flex-col gap-0.5 text-sm">
        {ingredients.map((line, n) => (
          <li key={n}>{line}</li>
        ))}
      </ul>
      {method ? <p className="whitespace-pre-line text-sm text-ink-soft">{method}</p> : <p className="text-sm text-ink-soft">No method.</p>}
    </div>
  );
}

