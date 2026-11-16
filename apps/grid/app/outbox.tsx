"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uuid } from "@/lib/uuid";

/**
 * Where a tap goes to be saved, and where it waits if the save fails
 * (RULES.md, Never 5: lose a tap).
 *
 * Every save is plain data, `{ url, body }`, so it can be sent again exactly as
 * it was. A save that fails (no signal, a 500) stays in `failed`, is written to
 * this browser's storage so a closed tab does not drop it, and shows in the
 * "Not saved" banner with a Retry. Nothing here ever says "saved" for a request
 * the server did not answer ok: the screen shows the day as the server holds it,
 * read again after every save.
 *
 * What a body carries (an entry's text) lives only in the request, this
 * browser's storage and the server. It is never logged.
 */
export type Op = { id: string; label: string; url: string; body: unknown };

const KEY = "grid.unsaved";

function load(): Op[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((o) => o && typeof o.id === "string" && typeof o.url === "string") : [];
  } catch {
    return [];
  }
}

function store(ops: Op[]) {
  try {
    if (ops.length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(ops));
  } catch {
    // Storage blocked: the banner still holds them until the tab closes.
  }
}

export function post(url: string, body: unknown) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export type Send = (label: string, url: string, body: unknown) => Promise<boolean>;

export function useOutbox(onSaved: () => Promise<void> | void) {
  const [failed, setFailed] = useState<Op[]>([]);
  const [busy, setBusy] = useState(0);
  const list = useRef<Op[]>([]);
  const saved = useRef(onSaved);
  saved.current = onSaved;

  const set = useCallback((next: Op[]) => {
    list.current = next;
    store(next);
    setFailed(next);
  }, []);

  // Read after mount, so the first render matches the server's.
  useEffect(() => {
    const kept = load();
    list.current = kept;
    setFailed(kept);
  }, []);

  const run = useCallback(
    async (op: Op): Promise<boolean> => {
      setBusy((n) => n + 1);
      let ok = false;
      try {
        ok = (await post(op.url, op.body)).ok;
      } catch {
        ok = false;
      }
      setBusy((n) => n - 1);
      if (ok) {
        if (list.current.some((f) => f.id === op.id)) set(list.current.filter((f) => f.id !== op.id));
        await saved.current();
      } else if (!list.current.some((f) => f.id === op.id)) {
        set([...list.current, op]);
      }
      return ok;
    },
    [set],
  );

  const send: Send = useCallback((label, url, body) => run({ id: uuid(), label, url, body }), [run]);
  const retry = useCallback((op: Op) => run(op), [run]);
  const discard = useCallback((op: Op) => set(list.current.filter((f) => f.id !== op.id)), [set]);

  return { send, retry, discard, failed, busy };
}

/** The banner: every save that did not land, with a Retry, above everything else. */
export function NotSaved({ failed, retry, discard }: { failed: Op[]; retry: (op: Op) => void; discard: (op: Op) => void }) {
  if (failed.length === 0) return null;
  return (
    <div role="alert" className="sticky top-0 z-30 border-b-2 border-urgent bg-surface px-4 py-3 text-sm">
      <p className="font-semibold text-urgent">Not saved</p>
      <ul className="mt-1 flex flex-col gap-1">
        {failed.map((op) => (
          <li key={op.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{op.label}</span>
            <button type="button" onClick={() => retry(op)} className="min-h-11 rounded-lg bg-accent px-4 font-medium text-accent-ink">
              Retry
            </button>
            <button type="button" onClick={() => discard(op)} className="min-h-11 px-2 text-ink/70 underline">
              Discard
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
