"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ASKS_FOR_DETAILS,
  CLOCKS,
  CLOCK_LABELS,
  KIND_LABELS,
  LOG_KINDS,
  describe,
  formatAgo,
  liveEvents,
  newestFirst,
  sinceLast,
  HORIZON_DAYS_LABEL,
  type JournalEvent,
  type LogKind,
} from "@/lib/events";
import { clockTime, localMidnight } from "@/lib/localtime";
import Editor, { type SaveResult } from "./Editor";
import GrowthChart from "./GrowthChart";

type Person = { id: string; display_name: string };
type Loaded = { events: JournalEvent[]; people: Person[] };

/** A tap on its way to the database, or one that did not get there. */
type Pending = {
  body: { id: string; kind: LogKind; at: string; person_id: string | null };
  status: "saving" | "failed";
  error?: string;
};

const PERSON_KEY = "lando.person";
const UNSAVED_KEY = "lando.unsaved";

/* Browser storage holds two conveniences only: who this phone logs as, and taps
   not yet saved so a closed app does not drop them. Either can vanish; the
   database is the journal. */
function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function writeStore(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private window or blocked storage: the screen still works */
  }
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * The one screen: since-last clocks, the log buttons, who is logging, today's
 * timeline, the growth chart.
 *
 * **A tap logs now and never waits on anything** — not the journal loading,
 * not a person being picked. Details are added after, as a correction. A tap
 * that fails to save stays on screen as "Not saved" with a retry (charter,
 * Never 5); it is never counted on a clock.
 */
export default function Journal() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [since, setSince] = useState(() => localMidnight(new Date()));
  const [personId, setPersonId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [personError, setPersonError] = useState<string | null>(null);
  const sinceRef = useRef(since);
  sinceRef.current = since;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/journal?since=${encodeURIComponent(sinceRef.current.toISOString())}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setLoaded({ events: data.events, people: data.people });
      setLoadError(null);
    } catch (e) {
      // Keep whatever was on screen; say it may be stale. Never blank it.
      setLoadError((e as Error).message || "couldn't reach the server");
    }
  }, []);

  // Pending taps are mirrored to storage so a closed app keeps them.
  const persistPending = useCallback((list: Pending[]) => {
    writeStore(UNSAVED_KEY, list.length ? list.map((p) => p.body) : null);
  }, []);

  const updatePending = useCallback(
    (fn: (list: Pending[]) => Pending[]) => {
      setPending((prev) => {
        const next = fn(prev);
        persistPending(next);
        return next;
      });
    },
    [persistPending]
  );

  const mergeEvent = useCallback((event: JournalEvent) => {
    setLoaded((prev) =>
      prev && !prev.events.some((e) => e.id === event.id) ? { ...prev, events: [...prev.events, event] } : prev
    );
  }, []);

  const save = useCallback(
    async (body: Pending["body"], fresh: boolean) => {
      updatePending((list) => [...list.filter((p) => p.body.id !== body.id), { body, status: "saving" }]);
      try {
        const { ok, data } = await postJson("/api/events", { ...body, details: {} });
        if (!ok) throw new Error(data.error ?? "the server refused it");
        mergeEvent(data.event);
        updatePending((list) => list.filter((p) => p.body.id !== body.id));
        if (fresh && ASKS_FOR_DETAILS.has(body.kind)) setEditing(body.id);
      } catch (e) {
        const error = e instanceof TypeError ? "no connection" : (e as Error).message;
        updatePending((list) => list.map((p) => (p.body.id === body.id ? { ...p, status: "failed", error } : p)));
      }
    },
    [mergeEvent, updatePending]
  );

  // Mount: who this phone is, any taps left unsaved last time, the journal.
  useEffect(() => {
    setPersonId(readStore<string | null>(PERSON_KEY, null));
    const unsaved = readStore<Pending["body"][]>(UNSAVED_KEY, []);
    if (Array.isArray(unsaved)) for (const body of unsaved) void save(body, false);
    void load();
  }, [load, save]);

  // The clocks tick, and "today" is re-read whenever the app comes back.
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 15_000);
    const back = () => {
      if (document.visibilityState !== "visible") return;
      const t = new Date();
      setNow(t);
      setSince(localMidnight(t));
      void load();
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
    };
  }, [load]);

  // A new day at midnight with the app open.
  useEffect(() => {
    const today = localMidnight(now);
    if (today.getTime() !== since.getTime()) setSince(today);
  }, [now, since]);

  const people = loaded?.people ?? [];
  const person = people.find((p) => p.id === personId) ?? null;
  const nameOf = useCallback(
    (id: string | null) => (id ? people.find((p) => p.id === id)?.display_name ?? "someone" : null),
    [people]
  );

  function tap(kind: LogKind) {
    const body = { id: crypto.randomUUID(), kind, at: new Date().toISOString(), person_id: person?.id ?? null };
    void save(body, true);
  }

  function pickPerson(value: string) {
    if (value === "__add") {
      setAdding(true);
      return;
    }
    const id = value || null;
    setPersonId(id);
    writeStore(PERSON_KEY, id);
  }

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    setPersonError(null);
    try {
      const { ok, data } = await postJson("/api/people", { display_name: newName });
      if (!ok) throw new Error(data.error ?? "couldn't add");
      setLoaded((prev) =>
        prev && !prev.people.some((p) => p.id === data.person.id) ? { ...prev, people: [...prev.people, data.person] } : prev
      );
      setPersonId(data.person.id);
      writeStore(PERSON_KEY, data.person.id);
      setAdding(false);
      setNewName("");
    } catch (err) {
      setPersonError(err instanceof TypeError ? "no connection" : (err as Error).message);
    }
  }

  const clocks = useMemo(() => (loaded ? sinceLast(loaded.events, now) : null), [loaded, now]);
  const today = useMemo(
    () =>
      loaded
        ? liveEvents(loaded.events)
            .filter((e) => Date.parse(e.at) >= since.getTime())
            .sort(newestFirst)
        : [],
    [loaded, since]
  );

  async function saveCorrection(body: Record<string, unknown>): Promise<SaveResult> {
    try {
      const { ok, status, data } = await postJson("/api/events", body);
      if (!ok) {
        if (status === 409) void load();
        return { error: data.error ?? "couldn't save" };
      }
      mergeEvent(data.event);
      setEditing(null);
      return { error: null };
    } catch (e) {
      return { error: e instanceof TypeError ? "no connection — try again" : (e as Error).message };
    }
  }

  const unsaved = [...pending].sort((a, b) => Date.parse(b.body.at) - Date.parse(a.body.at));

  return (
    <div className="flex flex-col gap-5">
      {loadError && (
        <div className="flex items-center gap-3 rounded-xl border border-urgent/40 bg-urgent/10 px-3 py-2 text-sm">
          <span className="flex-1">
            {loaded ? "Couldn't refresh — this may be out of date." : "Couldn't load the journal."} ({loadError})
          </span>
          <button onClick={() => void load()} className="font-medium underline">
            Retry
          </button>
        </div>
      )}

      {/* Since-last clocks */}
      <section aria-label="Since last" className="grid grid-cols-3 gap-2">
        {CLOCKS.map((c) => {
          const last = clocks?.[c] ?? null;
          return (
            <div key={c} className="rounded-xl border border-line bg-surface px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-ink-soft">{CLOCK_LABELS[c]}</div>
              <div className="mt-0.5 text-lg font-semibold leading-tight tabular-nums">
                {!clocks ? "—" : last ? formatAgo(last.at, now).replace(/ ago$/, "") : "none"}
              </div>
              <div className="text-xs text-ink-soft">
                {!clocks ? " " : last ? `ago · ${clockTime(last.at)}` : `in ${HORIZON_DAYS_LABEL}`}
              </div>
            </div>
          );
        })}
      </section>

      {/* Who is logging */}
      <section className="flex items-center gap-2 text-sm">
        <label htmlFor="who" className="text-ink-soft">
          Logging as
        </label>
        {adding ? (
          <form onSubmit={addPerson} className="flex flex-1 items-center gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={40}
              placeholder="Name"
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 outline-none focus:border-accent"
            />
            <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-ink">
              Add
            </button>
            <button type="button" onClick={() => setAdding(false)} className="text-ink-soft">
              Cancel
            </button>
          </form>
        ) : (
          <select
            id="who"
            value={person?.id ?? ""}
            onChange={(e) => pickPerson(e.target.value)}
            className="flex-1 rounded-lg border border-line bg-surface px-2 py-1.5"
          >
            <option value="">{loaded ? "Pick who you are" : "Loading…"}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
            {loaded && <option value="__add">+ Add someone…</option>}
          </select>
        )}
      </section>
      {personError && <p className="-mt-3 text-sm text-urgent">{personError}</p>}

      {/* Log buttons: a tap logs now */}
      <section aria-label="Log" className="grid grid-cols-4 gap-2">
        {LOG_KINDS.map((k) => (
          <button
            key={k}
            onClick={() => tap(k)}
            className={`h-16 rounded-xl border text-sm font-semibold transition active:scale-95 ${
              k === "accident" ? "border-danger/50 bg-surface text-danger" : "border-line bg-raised text-ink"
            }`}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </section>

      {/* Today */}
      <section aria-label="Today" className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Today</h2>
        {unsaved.length === 0 && today.length === 0 && (
          <p className="text-sm text-ink-soft">{loaded ? "Nothing logged yet today." : loadError ? "" : "Loading…"}</p>
        )}
        <ul className="flex flex-col gap-1.5">
          {unsaved.map((p) => (
            <li
              key={p.body.id}
              className="flex items-center gap-3 rounded-xl border border-dashed border-line bg-surface px-3 py-2 text-sm"
            >
              <span className="w-16 shrink-0 tabular-nums text-ink-soft">{clockTime(p.body.at)}</span>
              <span className="font-medium">{KIND_LABELS[p.body.kind]}</span>
              {p.status === "saving" ? (
                <span className="ml-auto text-ink-soft">Saving…</span>
              ) : (
                <span className="ml-auto flex items-center gap-3">
                  <span className="text-urgent">Not saved{p.error ? ` (${p.error})` : ""}</span>
                  <button onClick={() => void save(p.body, true)} className="font-medium underline">
                    Retry
                  </button>
                  <button
                    onClick={() => updatePending((list) => list.filter((x) => x.body.id !== p.body.id))}
                    className="text-ink-soft"
                    aria-label="Discard"
                  >
                    ✕
                  </button>
                </span>
              )}
            </li>
          ))}
          {today.map((e) => (
            <li key={e.id} className="rounded-xl border border-line bg-surface text-sm">
              <button
                onClick={() => setEditing(editing === e.id ? null : e.id)}
                className="flex w-full items-baseline gap-3 px-3 py-2 text-left"
                aria-expanded={editing === e.id}
              >
                <span className="w-16 shrink-0 tabular-nums text-ink-soft">{clockTime(e.at)}</span>
                <span className="font-medium">{KIND_LABELS[e.kind as LogKind]}</span>
                <span className="min-w-0 flex-1 truncate text-ink-soft">
                  {[describe(e), e.note].filter(Boolean).join(" · ")}
                </span>
                {e.person_id && <span className="shrink-0 text-xs text-ink-soft">{nameOf(e.person_id)}</span>}
              </button>
              {editing === e.id && (
                <Editor
                  event={e}
                  people={people}
                  events={loaded?.events ?? []}
                  onSave={saveCorrection}
                  onClose={() => setEditing(null)}
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Growth */}
      <section aria-label="Growth" className="flex flex-col gap-2 border-t border-line pt-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Growth</h2>
        {loaded ? <GrowthChart events={loaded.events} /> : <p className="text-sm text-ink-soft">—</p>}
      </section>
    </div>
  );
}
