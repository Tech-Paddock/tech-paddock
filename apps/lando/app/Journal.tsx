"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CLOCKS,
  CLOCK_LABELS,
  FORM_KINDS,
  FORM_LABELS,
  HORIZON_DAYS,
  KIND_LABELS,
  LOG_KINDS,
  PILL_STATUS_WORDS,
  describe,
  displayUnit,
  emptyFeedText,
  feedDays,
  followText,
  food as asFood,
  formOf,
  eventPhotos,
  formatAgo,
  isAccident,
  latestWeight,
  liveEvents,
  mealGapText,
  mealGaps,
  mealsToday,
  pillStatus,
  round1,
  sinceLast,
  treatsWith,
  weight as asWeight,
  type Dog,
  type FeedRow,
  type FormKind,
  type JournalEvent,
} from "@/lib/events";
import {
  DEFAULTS_KEY,
  PERSON_KEY,
  UNSAVED_KEY,
  readStore,
  writeStore,
  type Remembered,
} from "@/lib/defaults";
import { clockTime, localMidnight, shortDate } from "@/lib/localtime";
import { nameBoxWidth } from "@/lib/names";
import { saveThen } from "@/lib/saveOrder";
import Analytics from "./Analytics";
import { useReportMeals } from "./Meals";
import LogForm, { type LogBody, type Person } from "./LogForm";
import Sheet from "./Sheet";

type Loaded = { events: JournalEvent[]; people: Person[]; dogs: Dog[] };

/**
 * A new entry on its way to the database, or one that did not get there.
 * `then` are the treats picked in a training's Treats pop-up: saved once the
 * training is, discarded with it (TEC-136).
 */
type Pending = { body: LogBody; status: "saving" | "failed"; error?: string; then?: LogBody[] };

/** What `lando.unsaved` holds per entry: the body, plus its treats when it has any. */
type Stored = LogBody & { then?: LogBody[] };

type Open = { form: FormKind; event?: JournalEvent } | null;
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
 * Two tabs, Log and Analytics, opening on Log (RULES.md, Surface: app, the
 * owner's override, 2026-10-20). Log: since-last pills, who is logging, six section
 * buttons that each open a short form with defaults (Potty, Food, Fun,
 * Training, Weight, Health; TEC-136, TEC-137), and a feed of every loaded day, by when each
 * entry happened, with a filter matching the buttons. Analytics: the last
 * fourteen days and the growth chart.
 *
 * **Save never waits.** The sheet closes at once and the entry shows as
 * "Saving…", then joins the feed, or stays as "Not saved" with Retry
 * (RULES.md, Never 5). Unsaved entries are mirrored to storage and retried on
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
  // The feed shows one form's entries, or all when null (TEC-129, TEC-136). Not remembered.
  const [only, setOnly] = useState<FormKind | null>(null);
  // Signed URLs of health photos by storage path: the read's, plus every upload this session made.
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
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
      setPhotoUrls((prev) => ({ ...prev, ...(data.photos ?? {}) }));
      setLoadError(null);
    } catch (e) {
      // Keep whatever was on screen; say it may be stale. Never blank it.
      setLoadError((e as Error).message || "couldn't reach the server");
    }
  }, []);

  const updatePending = useCallback((fn: (list: Pending[]) => Pending[]) => {
    setPending((prev) => {
      const next = fn(prev);
      writeStore(
        UNSAVED_KEY,
        next.length ? next.map((p): Stored => (p.then?.length ? { ...p.body, then: p.then } : p.body)) : null
      );
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
    async function save(body: LogBody, announce: boolean, then?: LogBody[]): Promise<void> {
      const after = then?.length ? then : undefined;
      // The entry first; only once it is in, what follows it (a training's
      // treats, a vet visit's weight), each its own row with its own Retry.
      await saveThen(
        async (b) => {
          updatePending((list) => [...list.filter((p) => p.body.id !== b.id), { body: b, status: "saving", then: after }]);
          try {
            const { ok, data } = await postJson("/api/events", b);
            if (!ok) throw new Error(data.error ?? "the server refused it");
            mergeEvent(data.event);
            updatePending((list) => list.filter((p) => p.body.id !== b.id));
            if (announce) say(`${describe(b).title || KIND_LABELS[b.kind]} logged`);
            return true;
          } catch (e) {
            const error = e instanceof TypeError ? "no connection" : (e as Error).message;
            updatePending((list) => list.map((p) => (p.body.id === b.id ? { ...p, status: "failed", error } : p)));
            return false;
          }
        },
        (t) => void save(t, false),
        body,
        after
      );
    },
    [mergeEvent, updatePending, say]
  );

  // Mount: who this phone is, its defaults, anything left unsaved, the journal.
  useEffect(() => {
    setPersonId(readStore<string | null>(PERSON_KEY, null));
    setRemembered(readStore<Remembered>(DEFAULTS_KEY, {}) ?? {});
    setStorageRead(true);
    const unsaved = readStore<unknown[]>(UNSAVED_KEY, []);
    if (Array.isArray(unsaved)) {
      for (const stored of unsaved.filter(isLogBody) as Stored[]) {
        const { then, ...body } = stored;
        void save(body, false, Array.isArray(then) ? then.filter(isLogBody) : undefined);
      }
    }
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

  const rememberPhotoUrl = useCallback((path: string, url: string) => {
    setPhotoUrls((prev) => ({ ...prev, [path]: url }));
  }, []);

  function remember(bodies: LogBody[]) {
    const next = { ...remembered };
    for (const body of bodies) {
      // A meal's item and amount are remembered; a treat always opens on Misc.
      if (body.kind === "food") {
        const f = asFood(body);
        if (f.type === "meal") {
          next.meal = f.item_id;
          if (f.amount !== null) next.mealAmount = f.amount;
        }
      }
      // A weight's unit, also when it was typed on a vet visit (TEC-151).
      if (body.kind === "weight") next.unit = asWeight(body).unit;
    }
    setRemembered(next);
    writeStore(DEFAULTS_KEY, next);
  }

  function logNew(body: LogBody, then?: LogBody[]) {
    remember([body, ...(then ?? [])]);
    setOpen(null);
    void save(body, true, then);
  }

  async function change(body: Record<string, unknown>, then?: LogBody[]): Promise<{ error: string | null }> {
    try {
      const { ok, status, data } = await postJson("/api/events", body);
      if (!ok) {
        if (status === 409) void load();
        return { error: data.error ?? "couldn't save" };
      }
      mergeEvent(data.event);
      setOpen(null);
      // Treats added to a corrected training: saved now, each with its own Retry.
      for (const t of then ?? []) void save(t, false);
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
  // The second line under pee, poop and food (TEC-172): meal to pee, meal to poop, meal to meal.
  const gaps = useMemo(() => (loaded ? mealGaps(loaded.events, now) : null), [loaded, now]);
  // "Meals today: N" in the app bar (TEC-142): the phone's day, live meals only.
  useReportMeals(loaded ? mealsToday(loaded.events, now) : null);
  // The feed (TEC-136): every live entry in the read's window (today and the
  // HORIZON_DAYS before it; older weights stay in Analytics' growth chart),
  // plus anything not saved yet, under one chip's filter.
  const live = useMemo(() => {
    if (!loaded) return [];
    const start = since.getTime() - HORIZON_DAYS * 86_400_000; // the same window the server reads
    return liveEvents(loaded.events).filter((e) => Date.parse(e.at) >= start);
  }, [loaded, since]);
  type Row = { saved: JournalEvent } | { pending: Pending };
  const days = useMemo(() => {
    const rows: FeedRow<Row>[] = [
      ...pending.map((p) => ({ kind: p.body.kind, at: p.body.at, created_at: null, item: { pending: p } })),
      ...live.map((e) => ({ kind: e.kind, at: e.at, created_at: e.created_at, item: { saved: e } })),
    ];
    const shown = only
      ? rows.filter((r) => formOf("saved" in r.item ? r.item.saved : r.item.pending.body) === only)
      : rows;
    return feedDays(shown, now);
  }, [live, pending, only, now]);
  const anything = live.length > 0 || pending.length > 0;
  const lastWeight = loaded ? latestWeight(loaded.events) : null;
  const weightUnit = loaded ? displayUnit(loaded.events) : "lb";
  const weightNote = lastWeight
    ? `last ${round1(asWeight(lastWeight).value)} ${asWeight(lastWeight).unit}, ${
        Date.parse(lastWeight.at) >= since.getTime() ? "today" : shortDate(lastWeight.at)
      }`
    : null;
  // On the Weight button's face (TEC-136): "7.2 lb".
  const weightFace = lastWeight ? `${round1(asWeight(lastWeight).value)} ${asWeight(lastWeight).unit}` : null;
  // A row's time under its day's heading: the clock, or nothing for a weight (it is a day).
  const feedTime = (kind: string, at: string) => (kind === "weight" ? "" : clockTime(at));

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
              // Green, yellow or red by how long ago (TEC-142); exercise and "none" stay plain.
              const status = last ? pillStatus(c, now.getTime() - Date.parse(last.at)) : null;
              const gapLine = gaps && c !== "exercise" ? mealGapText(c, gaps[c]) : null;
              return (
                <div key={c} className="flex min-w-0 flex-col gap-0.5">
                <div
                  title={
                    last
                      ? `${CLOCK_LABELS[c]} at ${clockTime(last.at)}${status ? ` — ${PILL_STATUS_WORDS[status]}` : ""}`
                      : undefined
                  }
                  data-status={status ?? undefined}
                  className="lando-pill min-w-0 rounded-xl border border-line bg-surface px-1.5 py-1 text-center"
                >
                  <div className="truncate text-[10px] font-semibold uppercase leading-tight tracking-[0.08em] text-ink-soft">
                    {CLOCK_LABELS[c]}
                  </div>
                  <div className="whitespace-nowrap text-[15px] font-bold leading-tight tabular-nums">
                    {!clocks ? "—" : last ? formatAgo(last.at, now) : "none"}
                  </div>
                  <span className="sr-only">
                    {last
                      ? ` ago, at ${clockTime(last.at)}${status ? `, ${PILL_STATUS_WORDS[status]}` : ""}`
                      : clocks
                        ? ` in ${HORIZON_DAYS} days`
                        : ""}
                  </span>
                </div>
                {/* Second line (TEC-172): plain, no status colour; the pill above keeps its own. */}
                {gapLine && (
                  <div title={gapLine.words} className="truncate text-center text-[10px] leading-tight tabular-nums text-ink-soft">
                    <span aria-hidden="true">{gapLine.short}</span>
                    <span className="sr-only">{gapLine.words}</span>
                  </div>
                )}
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

          {/* Six sections, each opening its form, two rows of three (TEC-137):
              Potty, Food, Fun / Training, Weight, Health. The Weight button
              wears the newest weight; its date is in the title and for screen readers. */}
          <section aria-label="Log">
            <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">Log</h2>
            <div className="grid grid-cols-3 gap-1.5">
              {(["potty", "food", "fun", "training"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setOpen({ form: k })}
                  className="flex min-h-[52px] min-w-0 items-center justify-center rounded-xl bg-[var(--tone-2-bg)] px-0.5 py-2 text-[var(--tone-2-ink)] shadow-[0_3px_0_var(--tone-2-lip)] active:translate-y-0.5 active:shadow-[0_1px_0_var(--tone-2-lip)]"
                >
                  <b className="truncate text-[15px] leading-tight">{FORM_LABELS[k]}</b>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setOpen({ form: "weight" })}
                title={weightNote ?? undefined}
                className="flex min-h-[52px] min-w-0 flex-col items-center justify-center rounded-xl bg-raised px-0.5 py-1.5 text-ink shadow-[0_3px_0_rgb(var(--line-rgb))] active:translate-y-0.5 active:shadow-[0_1px_0_rgb(var(--line-rgb))]"
              >
                <b className="truncate text-[15px] leading-tight">Weight</b>
                {weightFace && (
                  <span aria-hidden="true" className="truncate text-[12px] leading-tight tabular-nums text-ink-soft">
                    {weightFace}
                  </span>
                )}
                {weightNote && <span className="sr-only">, {weightNote}</span>}
              </button>
              <button
                type="button"
                onClick={() => setOpen({ form: "health" })}
                className="flex min-h-[52px] min-w-0 items-center justify-center rounded-xl bg-[var(--tone-2-bg)] px-0.5 py-2 text-[var(--tone-2-ink)] shadow-[0_3px_0_var(--tone-2-lip)] active:translate-y-0.5 active:shadow-[0_1px_0_var(--tone-2-lip)]"
              >
                <b className="truncate text-[15px] leading-tight">{FORM_LABELS.health}</b>
              </button>
            </div>
          </section>

          {/* The feed: every loaded day, newest first, by when it happened (TEC-136) */}
          <section aria-label="Feed">
            <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">Feed</h2>
            {/* Filter (TEC-129, TEC-136, TEC-171): small outlined pills in one row that
                scrolls sideways, so they do not read as the Log tiles above. All first,
                selected when nothing is picked; tap a form's pill to show only it, tap it
                again (or All) for everything. Across every day. The button is the 44px
                hit area; the pill is its inner span. */}
            <div
              role="group"
              aria-label="Show only"
              className="-mx-3 mb-2 flex gap-1 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {([null, ...FORM_KINDS] as const).map((k) => {
                const selected = only === k;
                return (
                  <button
                    key={k ?? "all"}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setOnly(k === null || only === k ? null : k)}
                    className="flex min-h-[44px] shrink-0 items-center"
                  >
                    <span
                      className={`whitespace-nowrap rounded-full border px-3 py-1 text-[13px] font-semibold ${
                        selected ? "border-ink bg-ink text-ink-invert" : "border-line bg-transparent text-ink-soft"
                      }`}
                    >
                      {k === null ? "All" : FORM_LABELS[k]}
                    </span>
                  </button>
                );
              })}
            </div>
            {days.length === 0 && (
              <p className="text-ink-soft">
                {!loaded ? (loadError ? "" : "Loading…") : emptyFeedText(anything ? only : null)}
              </p>
            )}
            <div className="flex flex-col gap-3">
              {days.map((d) => (
                <section key={d.day} aria-label={d.label}>
                  <h3 className="mb-1 text-[13px] font-bold text-ink">{d.label}</h3>
                  <ul className="flex flex-col gap-1">
                    {d.rows.map(({ item }) => {
                      if ("pending" in item) {
                        const p = item.pending;
                        const { title } = describe(p.body);
                        // What Retry and ✕ carry with it: "+ 2 treats", or "+ 7.6 lb" (TEC-151).
                        const after = p.then?.length ? followText(p.then) : "";
                        return (
                          <li
                            key={p.body.id}
                            className="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-baseline gap-2 rounded-xl border border-dashed border-line bg-surface px-2.5 py-2"
                          >
                            <span className="whitespace-nowrap text-sm tabular-nums text-ink-soft">{feedTime(p.body.kind, p.body.at)}</span>
                            <span className="min-w-0 truncate">
                              <b>{title}</b>
                              {after && <span className="ml-1.5 text-sm text-ink-soft">{after}</span>}
                            </span>
                            {p.status === "saving" ? (
                              <span className="text-sm text-ink-soft">Saving…</span>
                            ) : (
                              <span className="flex items-center gap-3 text-sm">
                                <span className="text-urgent" title={p.error}>
                                  Not saved
                                </span>
                                <button onClick={() => void save(p.body, true, p.then)} className="font-medium underline">
                                  Retry
                                </button>
                                <button
                                  onClick={() => updatePending((list) => list.filter((x) => x.body.id !== p.body.id))}
                                  className="text-ink-soft"
                                  aria-label={after ? `Discard, with its ${p.then?.some((t) => t.kind === "weight") ? "weight" : "treats"}` : "Discard"}
                                >
                                  ✕
                                </button>
                              </span>
                            )}
                          </li>
                        );
                      }
                      const e = item.saved;
                      const { title, detail } = describe(e, dogs, loaded?.events);
                      const accident = isAccident(e);
                      return (
                        <li key={e.id}>
                          <button
                            type="button"
                            onClick={() => setOpen({ form: formOf(e) ?? "potty", event: e })}
                            title={[feedTime(e.kind, e.at), title, detail, e.note ? `“${e.note}”` : "", nameOf(e.person_id)].filter(Boolean).join(" ")}
                            className={`grid w-full grid-cols-[4rem_minmax(0,1fr)_auto] items-baseline gap-2 rounded-xl border bg-surface px-2.5 py-2 text-left ${
                              accident ? "border-danger" : "border-line"
                            }`}
                          >
                            <span className="whitespace-nowrap text-sm tabular-nums text-ink-soft">{feedTime(e.kind, e.at)}</span>
                            {/* One line, cut off with an ellipsis (TEC-139); the full text is the
                                row's title and its entry, one tap away. */}
                            <span className="min-w-0">
                              <span className="block truncate">
                                <b className={`mr-1.5 ${accident ? "text-danger" : ""}`}>{title}</b>
                                <span className="text-sm text-ink-soft">{detail}</span>
                                {e.note && <span className="ml-1.5 text-sm text-ink-soft">“{e.note}”</span>}
                              </span>
                              {eventPhotos(e).length > 0 && (
                                <span className="mt-1 flex gap-1">
                                  {eventPhotos(e).slice(0, 4).map((path, i) =>
                                    photoUrls[path] ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img key={path} src={photoUrls[path]} alt={`Photo ${i + 1}`} loading="lazy" className="h-10 w-10 shrink-0 rounded-md border border-line object-cover" />
                                    ) : (
                                      <span key={path} className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line text-[10px] leading-tight text-ink-soft">
                                        No photo
                                      </span>
                                    )
                                  )}
                                  {eventPhotos(e).length > 4 && (
                                    <span className="self-center text-[13px] text-ink-soft">+{eventPhotos(e).length - 4}</span>
                                  )}
                                </span>
                              )}
                            </span>
                            <span className="whitespace-nowrap text-[13px] text-ink-soft">{nameOf(e.person_id)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
            {live.length > 0 && <p className="mt-1.5 text-xs text-ink-soft">Tap an entry to correct or delete it.</p>}
          </section>
        </div>
      </div>

      {open && !askWho && (
        <Sheet title={open.event ? `Edit ${describe(open.event).title.toLowerCase()}` : FORM_LABELS[open.form]} onClose={() => setOpen(null)}>
          <LogForm
            key={open.event?.id ?? open.form}
            form={open.form}
            event={open.event}
            sessionTreats={open.form === "training" && open.event && loaded ? treatsWith(loaded.events, open.event) : undefined}
            people={people}
            dogs={dogs}
            onAddDog={addDog}
            phonePerson={person?.id ?? null}
            events={loaded?.events ?? []}
            photoUrls={photoUrls}
            onPhotoUrl={rememberPhotoUrl}
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
