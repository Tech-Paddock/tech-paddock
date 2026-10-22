"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CLOCKS,
  CLOCK_LABELS,
  HORIZON_DAYS,
  KIND_LABELS,
  LOG_KINDS,
  describe,
  displayUnit,
  food as asFood,
  formatAgo,
  isAccident,
  latestWeight,
  liveEvents,
  newestFirst,
  round1,
  sinceLast,
  weight as asWeight,
  type Dog,
  type JournalEvent,
  type LogKind,
} from "@/lib/events";
import {
  DEFAULTS_KEY,
  PERSON_KEY,
  UNSAVED_KEY,
  readStore,
  writeStore,
  type Remembered,
} from "@/lib/defaults";
import { clockTime, localMidnight, rowTime, shortDate } from "@/lib/localtime";
import { nameBoxWidth } from "@/lib/names";
import Analytics from "./Analytics";
import LogForm, { type LogBody, type Person } from "./LogForm";
import Sheet from "./Sheet";

type Loaded = { events: JournalEvent[]; people: Person[]; dogs: Dog[] };

/** A new entry on its way to the database, or one that did not get there. */
type Pending = { body: LogBody; status: "saving" | "failed"; error?: string };

type Open = { kind: LogKind; event?: JournalEvent } | null;
type Tab = "log" | "analytics";

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const isLogBody = (b: unknown): b is LogBody =>
  !!b && typeof b === "object" && LOG_KINDS.includes((b as LogBody).kind) && typeof (b as LogBody).details === "object";

/**
 * Two tabs, Log and Analytics, opening on Log (charter, Scope: the owner's
 * override, 2026-10-20). Log: since-last pills, who is logging, four section
 * buttons that each open a short form with defaults, today's timeline with a
 * filter by kind. Analytics: the last fourteen days and the growth chart.
 *
 * **Save never waits.** The sheet closes at once and the entry shows as
 * "Saving…", then joins the timeline, or stays as "Not saved" with Retry
 * (charter, Never 5). Unsaved entries are mirrored to storage and retried on
 * the next open.
 */
export default function Journal() {
  const [tab, setTab] = useState<Tab>("log");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [since, setSince] = useState(() => localMidnight(new Date()));
  const [personId, setPersonId] = useState<string | null>(null);
  const [remembered, setRemembered] = useState<Remembered>({});
  const [storageRead, setStorageRead] = useState(false);
  const [open, setOpen] = useState<Open>(null);
  // Today's feed shows one kind, or every kind when null (TEC-129). Not remembered.
  const [only, setOnly] = useState<LogKind | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [personError, setPersonError] = useState<string | null>(null);
  const sinceRef = useRef(since);
  sinceRef.current = since;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/journal?since=${encodeURIComponent(sinceRef.current.toISOString())}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setLoaded({ events: data.events, people: data.people, dogs: data.dogs ?? [] });
      setLoadError(null);
    } catch (e) {
      // Keep whatever was on screen; say it may be stale. Never blank it.
      setLoadError((e as Error).message || "couldn't reach the server");
    }
  }, []);

  const updatePending = useCallback((fn: (list: Pending[]) => Pending[]) => {
    setPending((prev) => {
      const next = fn(prev);
      writeStore(UNSAVED_KEY, next.length ? next.map((p) => p.body) : null);
      return next;
    });
  }, []);

  const mergeEvent = useCallback((event: JournalEvent) => {
    setLoaded((prev) =>
      prev && !prev.events.some((e) => e.id === event.id) ? { ...prev, events: [...prev.events, event] } : prev
    );
  }, []);

  const say = useCallback((text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const save = useCallback(
    async (body: LogBody, announce: boolean) => {
      updatePending((list) => [...list.filter((p) => p.body.id !== body.id), { body, status: "saving" }]);
      try {
        const { ok, data } = await postJson("/api/events", body);
        if (!ok) throw new Error(data.error ?? "the server refused it");
        mergeEvent(data.event);
        updatePending((list) => list.filter((p) => p.body.id !== body.id));
        if (announce) say(`${describe(body).title || KIND_LABELS[body.kind]} logged`);
      } catch (e) {
        const error = e instanceof TypeError ? "no connection" : (e as Error).message;
        updatePending((list) => list.map((p) => (p.body.id === body.id ? { ...p, status: "failed", error } : p)));
      }
    },
    [mergeEvent, updatePending, say]
  );

  // Mount: who this phone is, its defaults, anything left unsaved, the journal.
  useEffect(() => {
    setPersonId(readStore<string | null>(PERSON_KEY, null));
    setRemembered(readStore<Remembered>(DEFAULTS_KEY, {}) ?? {});
    setStorageRead(true);
    const unsaved = readStore<unknown[]>(UNSAVED_KEY, []);
    if (Array.isArray(unsaved)) for (const body of unsaved.filter(isLogBody)) void save(body, false);
    void load();
  }, [load, save]);

  // The pills tick, and "today" is re-read whenever the app comes back.
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
  const dogs = loaded?.dogs ?? [];
  const person = people.find((p) => p.id === personId) ?? null;
  const nameOf = (id: string | null) => (id ? people.find((p) => p.id === id)?.display_name ?? "someone" : null);
  // First open on a phone: ask once whose it is.
  const askWho = storageRead && !!loaded && !person;

  function choosePerson(id: string | null) {
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
      choosePerson(data.person.id);
      setAdding(false);
      setNewName("");
    } catch (err) {
      setPersonError(err instanceof TypeError ? "no connection" : (err as Error).message);
    }
  }

  async function addDog(name: string): Promise<{ dog: Dog | null; error: string | null }> {
    try {
      const { ok, data } = await postJson("/api/dogs", { name });
      if (!ok) return { dog: null, error: data.error ?? "couldn't add" };
      const dog = data.dog as Dog;
      setLoaded((prev) =>
        prev && !prev.dogs.some((d) => d.id === dog.id)
          ? { ...prev, dogs: [...prev.dogs, dog].sort((a, b) => a.name.localeCompare(b.name)) }
          : prev
      );
      return { dog, error: null };
    } catch (e) {
      return { dog: null, error: e instanceof TypeError ? "no connection" : (e as Error).message };
    }
  }

  function remember(body: LogBody) {
    const next = { ...remembered };
    // A meal's item and amount are remembered; a treat always opens on Misc.
    if (body.kind === "food") {
      const f = asFood(body);
      if (f.type === "meal") {
        next.meal = f.item_id;
        if (f.amount !== null) next.mealAmount = f.amount;
      }
    }
    if (body.kind === "weight") next.unit = asWeight(body).unit;
    setRemembered(next);
    writeStore(DEFAULTS_KEY, next);
  }

  function logNew(body: LogBody) {
    remember(body);
    setOpen(null);
    void save(body, true);
  }

  async function change(body: Record<string, unknown>): Promise<{ error: string | null }> {
    try {
      const { ok, status, data } = await postJson("/api/events", body);
      if (!ok) {
        if (status === 409) void load();
        return { error: data.error ?? "couldn't save" };
      }
      mergeEvent(data.event);
      setOpen(null);
      say(body.kind === "void" ? "Entry deleted" : "Entry corrected");
      return { error: null };
    } catch (e) {
      return { error: e instanceof TypeError ? "no connection — try again" : (e as Error).message };
    }
  }

  function showTab(t: Tab) {
    setTab(t);
    window.scrollTo(0, 0);
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
  const unsaved = [...pending].sort((a, b) => Date.parse(b.body.at) - Date.parse(a.body.at));
  const shownToday = only ? today.filter((e) => e.kind === only) : today;
  const shownUnsaved = only ? unsaved.filter((p) => p.body.kind === only) : unsaved;
  const lastWeight = loaded ? latestWeight(loaded.events) : null;
  const weightUnit = loaded ? displayUnit(loaded.events) : "lb";
  const weightNote = lastWeight
    ? `last ${round1(asWeight(lastWeight).value)} ${asWeight(lastWeight).unit}, ${
        Date.parse(lastWeight.at) >= since.getTime() ? "today" : shortDate(lastWeight.at)
      }`
    : null;

  const tabClass = (t: Tab) =>
    `border-b-[3px] pb-2 pt-2.5 font-bold ${t === tab ? "border-pinstripe text-ink" : "border-transparent text-ink-soft"}`;

  return (
    <>
      <nav
        role="tablist"
        aria-label="Lando"
        className="sticky z-10 border-b border-line bg-paper"
        style={{ top: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="mx-auto grid max-w-md grid-cols-2 px-3">
          <button role="tab" type="button" id="tab-log" aria-selected={tab === "log"} aria-controls="panel-log" onClick={() => showTab("log")} className={tabClass("log")}>
            Log
          </button>
          <button role="tab" type="button" id="tab-analytics" aria-selected={tab === "analytics"} aria-controls="panel-analytics" onClick={() => showTab("analytics")} className={tabClass("analytics")}>
            Analytics
          </button>
        </div>
      </nav>

      <div className="mx-auto max-w-md px-3 pb-10 pt-3">
        {loadError && (
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-urgent/40 bg-urgent/10 px-3 py-2 text-sm">
            <span className="flex-1">
              {loaded ? "Couldn't refresh — this may be out of date." : "Couldn't load the journal."} ({loadError})
            </span>
            <button onClick={() => void load()} className="font-medium underline">
              Retry
            </button>
          </div>
        )}

        <div id="panel-analytics" role="tabpanel" aria-labelledby="tab-analytics" hidden={tab !== "analytics"}>
          {tab === "analytics" &&
            (loaded ? <Analytics events={loaded.events} now={now} /> : <p className="text-sm text-ink-soft">{loadError ? "" : "Loading…"}</p>)}
        </div>

        {/* `hidden` alone loses to Tailwind's `flex`, so the class carries it too. */}
        <div
          id="panel-log"
          role="tabpanel"
          aria-labelledby="tab-log"
          hidden={tab !== "log"}
          className={tab === "log" ? "flex flex-col gap-4" : "hidden"}
        >
          {/* Since-last pills: one row, label over value; the clock time is in the title. */}
          <section aria-label="Since last" className="grid grid-cols-4 gap-1.5">
            {CLOCKS.map((c) => {
              const last = clocks?.[c] ?? null;
              return (
                <div
                  key={c}
                  title={last ? `${CLOCK_LABELS[c]} at ${clockTime(last.at)}` : undefined}
                  className="min-w-0 rounded-xl border border-line bg-surface px-1.5 py-1 text-center"
                >
                  <div className="truncate text-[10px] font-semibold uppercase leading-tight tracking-[0.08em] text-ink-soft">
                    {CLOCK_LABELS[c]}
                  </div>
                  <div className="whitespace-nowrap text-[15px] font-bold leading-tight tabular-nums">
                    {!clocks ? "—" : last ? formatAgo(last.at, now) : "none"}
                  </div>
                  <span className="sr-only">
                    {last ? ` ago, at ${clockTime(last.at)}` : clocks ? ` in ${HORIZON_DAYS} days` : ""}
                  </span>
                </div>
              );
            })}
          </section>

          {/* Who is logging */}
          <section className="flex items-center gap-2">
            <label htmlFor="who" className="text-ink-soft">
              Logging as
            </label>
            {adding ? (
              <form onSubmit={addPerson} className="flex min-w-0 flex-1 items-center gap-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={40}
                  placeholder="Name"
                  className="min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-2.5 py-2 outline-none focus:border-accent"
                />
                <button type="submit" className="rounded-[10px] bg-accent px-3 py-2 font-medium text-accent-ink">
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
                onChange={(e) => (e.target.value === "__add" ? setAdding(true) : choosePerson(e.target.value || null))}
                className="min-w-0 rounded-[10px] border border-line bg-surface px-2.5 py-2"
                style={{ width: nameBoxWidth(people.map((p) => p.display_name)) }}
              >
                <option value="">{loaded ? "Who?" : "…"}</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
                {loaded && <option value="__add">+ Add someone…</option>}
              </select>
            )}
          </section>
          {personError && !askWho && <p className="-mt-3 text-sm text-urgent">{personError}</p>}

          {/* Four sections, each opening its form */}
          <section aria-label="Log">
            <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">Log</h2>
            {/* Four across on a phone, label only (TEC-123). The newest weight
                is in the Weight button's title and for screen readers, and in
                Analytics' growth chart. */}
            <div className="grid grid-cols-4 gap-1.5">
              {(["potty", "food", "exercise"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setOpen({ kind: k })}
                  className="flex min-h-[52px] min-w-0 items-center justify-center rounded-xl bg-[var(--tone-2-bg)] px-1 py-2 text-[var(--tone-2-ink)] shadow-[0_3px_0_var(--tone-2-lip)] active:translate-y-0.5 active:shadow-[0_1px_0_var(--tone-2-lip)]"
                >
                  <b className="truncate text-[15px] leading-tight">{KIND_LABELS[k]}</b>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setOpen({ kind: "weight" })}
                title={weightNote ?? undefined}
                className="flex min-h-[52px] min-w-0 items-center justify-center rounded-xl bg-raised px-1 py-2 text-ink shadow-[0_3px_0_rgb(var(--line-rgb))] active:translate-y-0.5 active:shadow-[0_1px_0_rgb(var(--line-rgb))]"
              >
                <b className="truncate text-[15px] leading-tight">Weight</b>
                {weightNote && <span className="sr-only">, {weightNote}</span>}
              </button>
            </div>
          </section>

          {/* Today */}
          <section aria-label="Today">
            <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">Today</h2>
            {/* Filter by kind (TEC-129): tap one to show only it, tap it again for all. */}
            <div role="group" aria-label="Show only" className="mb-2 flex flex-wrap gap-1.5">
              {LOG_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={only === k}
                  onClick={() => setOnly(only === k ? null : k)}
                  className={`min-h-[36px] whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm ${
                    only === k ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface"
                  }`}
                >
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>
            {shownUnsaved.length === 0 && shownToday.length === 0 && (
              <p className="text-ink-soft">
                {!loaded
                  ? loadError
                    ? ""
                    : "Loading…"
                  : only && (today.length > 0 || unsaved.length > 0)
                    ? `No ${KIND_LABELS[only].toLowerCase()} entries yet today.`
                    : "Nothing logged yet today."}
              </p>
            )}
            <ul className="flex flex-col gap-1">
              {shownUnsaved.map((p) => {
                const { title } = describe(p.body);
                return (
                  <li
                    key={p.body.id}
                    className="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-baseline gap-2 rounded-xl border border-dashed border-line bg-surface px-2.5 py-2"
                  >
                    <span className="whitespace-nowrap text-sm tabular-nums text-ink-soft">{rowTime(p.body.kind, p.body.at, now)}</span>
                    <b className="truncate">{title}</b>
                    {p.status === "saving" ? (
                      <span className="text-sm text-ink-soft">Saving…</span>
                    ) : (
                      <span className="flex items-center gap-3 text-sm">
                        <span className="text-urgent" title={p.error}>
                          Not saved
                        </span>
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
                );
              })}
              {shownToday.map((e) => {
                const { title, detail } = describe(e, dogs);
                const accident = isAccident(e);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setOpen({ kind: e.kind as LogKind, event: e })}
                      className={`grid w-full grid-cols-[4rem_minmax(0,1fr)_auto] items-baseline gap-2 rounded-xl border bg-surface px-2.5 py-2 text-left ${
                        accident ? "border-danger" : "border-line"
                      }`}
                    >
                      <span className="whitespace-nowrap text-sm tabular-nums text-ink-soft">{rowTime(e.kind, e.at, now)}</span>
                      <span className="min-w-0">
                        <b className={`mr-1.5 ${accident ? "text-danger" : ""}`}>{title}</b>
                        <span className="text-sm text-ink-soft">{detail}</span>
                        {e.note && <span className="block text-sm text-ink-soft">“{e.note}”</span>}
                      </span>
                      <span className="whitespace-nowrap text-[13px] text-ink-soft">{nameOf(e.person_id)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {shownToday.length > 0 && <p className="mt-1.5 text-xs text-ink-soft">Tap an entry to correct or delete it.</p>}
          </section>
        </div>
      </div>

      {open && !askWho && (
        <Sheet title={open.event ? `Edit ${describe(open.event).title.toLowerCase()}` : KIND_LABELS[open.kind]} onClose={() => setOpen(null)}>
          <LogForm
            key={open.event?.id ?? open.kind}
            kind={open.kind}
            event={open.event}
            people={people}
            dogs={dogs}
            onAddDog={addDog}
            phonePerson={person?.id ?? null}
            remembered={remembered}
            weightUnit={weightUnit}
            onLog={logNew}
            onChange={change}
          />
        </Sheet>
      )}

      {askWho && (
        <Sheet title="Whose phone is this?">
          <p className="text-[13px] text-ink-soft">
            Asked once. Every entry from this phone is logged as you. Change it any time under &ldquo;Logging as&rdquo;.
          </p>
          {people.length > 0 && (
            <div className="grid grid-cols-2 gap-2.5">
              {people.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  data-autofocus={i === 0 ? true : undefined}
                  onClick={() => choosePerson(p.id)}
                  className="grid min-h-[76px] content-start gap-0.5 rounded-2xl bg-[var(--tone-2-bg)] px-3.5 py-3.5 text-left text-[var(--tone-2-ink)] shadow-[0_4px_0_var(--tone-2-lip)]"
                >
                  <b className="truncate text-[21px] leading-tight">{p.display_name}</b>
                  <span className="text-[13px] opacity-80">This is my phone</span>
                </button>
              ))}
            </div>
          )}
          <form onSubmit={addPerson} className="flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={40}
              placeholder={people.length ? "Someone else? Your name" : "Your name"}
              aria-label="Your name"
              data-autofocus={people.length ? undefined : true}
              className="min-w-0 flex-1 rounded-[10px] border border-line bg-paper px-2.5 py-2.5 outline-none focus:border-accent"
            />
            <button type="submit" className="rounded-[10px] bg-accent px-4 py-2.5 font-semibold text-accent-ink">
              Add
            </button>
          </form>
          {personError && <p className="text-sm text-urgent">{personError}</p>}
        </Sheet>
      )}

      {toast && (
        <div
          role="status"
          className="fixed left-1/2 z-40 -translate-x-1/2 rounded-full bg-ink px-4 py-2.5 font-semibold text-paper"
          style={{ bottom: "calc(18px + env(safe-area-inset-bottom, 0px))" }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
