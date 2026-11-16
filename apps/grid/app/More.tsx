"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { WEEKDAY_LETTERS } from "@/lib/days";
import type { GridList, More as MoreData } from "@/lib/types";
import { uuid } from "@/lib/uuid";
import { NotSaved, useOutbox, type Send } from "./outbox";
import { AddRoutine } from "./Routines";

/**
 * Goals and lists, the same nouns one step out from Today (RULES.md, Surface),
 * and the routines' own list, where one is retired. Same saving rules as Today:
 * a tap goes through the outbox and shows only what the server holds.
 */
function AddLine({ label, placeholder, onAdd }: { label: string; placeholder: string; onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        onAdd(t);
        setText("");
      }}
      className="mt-2 flex gap-2"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={200}
        placeholder={placeholder}
        aria-label={label}
        className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 outline-none focus:border-accent"
      />
      <button type="submit" disabled={!text.trim()} className="min-h-11 rounded-lg bg-accent px-4 font-medium text-accent-ink disabled:opacity-50">
        Add
      </button>
    </form>
  );
}

function Check({ done, label, onToggle }: { done: boolean; label: string; onToggle: (next: boolean) => Promise<unknown> }) {
  const [want, setWant] = useState<boolean | null>(null);
  const shown = want ?? done;
  return (
    <li className="border-b border-line/40 last:border-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={shown}
        onClick={async () => {
          setWant(!shown);
          await onToggle(!shown);
          setWant(null);
        }}
        className="flex min-h-11 w-full items-center gap-1 text-left"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-md border-2 ${shown ? "border-accent bg-accent text-accent-ink" : "border-line"} ${want != null ? "opacity-60" : ""}`}
            aria-hidden="true"
          >
            {shown ? "✓" : ""}
          </span>
        </span>
        <span className={`py-2 break-words ${shown ? "text-ink/50 line-through" : ""}`}>{label}</span>
      </button>
    </li>
  );
}

function ListCard({ list, send }: { list: GridList; send: Send }) {
  return (
    <li className="rounded-xl border border-line/60 p-3">
      <h3 className="font-medium">{list.name}</h3>
      {list.items.length > 0 && (
        <ul className="mt-1">
          {list.items.map((i) => (
            <Check key={i.id} done={i.done} label={i.text} onToggle={(next) => send(`${next ? "Tick" : "Untick"} list item: ${i.text}`, "/api/lists", { op: "done_item", id: i.id, done: next })} />
          ))}
        </ul>
      )}
      <AddLine
        label={`New item in ${list.name}`}
        placeholder="Add an item"
        onAdd={(text) => void send(`Add list item: ${text}`, "/api/lists", { op: "add_item", id: uuid(), list_id: list.id, text })}
      />
    </li>
  );
}

export default function More() {
  const [data, setData] = useState<MoreData | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/more", { cache: "no-store" });
      if (!res.ok) throw new Error("read failed");
      setData((await res.json()) as MoreData);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const { send, retry, discard, failed: unsaved, busy } = useOutbox(load);

  return (
    <>
      <NotSaved failed={unsaved} retry={(op) => void retry(op)} discard={discard} />
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-24 pt-4">
        <Link href="/" className="flex min-h-11 items-center text-sm underline">
          ← Today
        </Link>
        {busy > 0 && (
          <p role="status" className="text-sm text-ink/70">
            Saving…
          </p>
        )}
        {failed && (
          <p role="alert" className="flex items-center gap-3 rounded-lg border border-urgent px-3 py-2 text-sm">
            <span className="flex-1">Couldn&apos;t load.</span>
            <button type="button" onClick={() => void load()} className="min-h-11 rounded-lg bg-accent px-4 font-medium text-accent-ink">
              Retry
            </button>
          </p>
        )}
        {!data ? (
          !failed && <p className="py-10 text-center text-ink/70">Loading…</p>
        ) : (
          <>
            <section aria-labelledby="goals-h" className="rounded-2xl border border-line bg-surface p-4">
              <h2 id="goals-h" className="text-lg font-semibold">
                Goals
              </h2>
              {data.goals.length === 0 && <p className="mt-2 text-sm text-ink/70">No goals yet.</p>}
              <ul className="mt-1">
                {data.goals.map((g) => (
                  <Check key={g.id} done={g.done} label={g.title} onToggle={(next) => send(`${next ? "Tick" : "Reopen"} goal: ${g.title}`, "/api/goals", { op: "done", id: g.id, done: next })} />
                ))}
              </ul>
              <AddLine label="New goal" placeholder="Add a goal" onAdd={(title) => void send(`Add goal: ${title}`, "/api/goals", { op: "add", id: uuid(), title })} />
            </section>

            <section aria-labelledby="lists-h" className="rounded-2xl border border-line bg-surface p-4">
              <h2 id="lists-h" className="text-lg font-semibold">
                Lists
              </h2>
              {data.lists.length === 0 && <p className="mt-2 text-sm text-ink/70">No lists yet.</p>}
              <ul className="mt-2 flex flex-col gap-3">
                {data.lists.map((l) => (
                  <ListCard key={l.id} list={l} send={send} />
                ))}
              </ul>
              <AddLine label="New list" placeholder="Name a list" onAdd={(name) => void send(`Add list: ${name}`, "/api/lists", { op: "add_list", id: uuid(), name })} />
            </section>

            <section aria-labelledby="routines-h" className="rounded-2xl border border-line bg-surface p-4">
              <h2 id="routines-h" className="text-lg font-semibold">
                Routines
              </h2>
              {data.routines.length === 0 && <p className="mt-2 text-sm text-ink/70">No routines yet.</p>}
              <ul className="mt-1">
                {data.routines.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 border-b border-line/40 py-1 last:border-0">
                    <span className="min-w-0 flex-1">
                      <span className="break-words">{r.name}</span>
                      <span className="block text-xs text-ink/70">
                        {r.weekdays.length === 7 ? "Every day" : r.weekdays.map((d) => WEEKDAY_LETTERS[d]).join(" ")}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void send(`Retire routine: ${r.name}`, "/api/routines", { op: "archive", id: r.id })}
                      className="min-h-11 px-2 text-sm text-ink/70 underline"
                    >
                      Retire
                    </button>
                  </li>
                ))}
              </ul>
              <AddRoutine send={send} />
            </section>
          </>
        )}
      </div>
    </>
  );
}
