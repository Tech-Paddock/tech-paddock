"use client";

import { useRef, useState } from "react";
import {
  REPEAT_MAX,
  REPEAT_UNITS,
  TITLE_MAX,
  UPCOMING_KINDS,
  UPCOMING_LABELS,
  UPCOMING_TONE_WORDS,
  dueText,
  needsVisit,
  openItems,
  repeatText,
  upcomingTone,
  type RepeatUnit,
  type Upcoming,
  type UpcomingInput,
  type UpcomingKind,
} from "@/lib/upcoming";
import Sheet from "./Sheet";

type Result = { error: string | null };

const input =
  "w-full min-w-0 rounded-[10px] border border-line bg-paper px-2.5 py-2.5 outline-none focus:border-accent";

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1">
      <label htmlFor={htmlFor} className="text-xs uppercase tracking-[0.06em] text-ink-soft">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * The Upcoming tab (TEC-192): open vet visits, vaccines, medications and other plans, soonest first,
 * coloured like the pills (amber within 7 days, red overdue, the rest neutral). Add and edit in a bottom
 * sheet; cancel hides an item and keeps it. Done on a vet visit or vaccine is the journal's to finish
 * (`onDone` opens the Vet visit form); Done on the rest marks it at once.
 */
export default function UpcomingTab({
  items,
  error,
  today,
  onRetry,
  onSave,
  onCancel,
  onDone,
}: {
  items: Upcoming[] | null;
  error: string | null;
  /** The phone's day, YYYY-MM-DD. */
  today: string;
  onRetry: () => void;
  /** Add (no id) or edit an item; awaited, and its error shown on the form. */
  onSave: (item: UpcomingInput, id?: string) => Promise<Result>;
  onCancel: (id: string) => Promise<Result>;
  /** Done: a vet visit or vaccine opens its form (returns nothing to await); the rest are marked at once. */
  onDone: (item: Upcoming) => Promise<Result | void>;
}) {
  const [editing, setEditing] = useState<Upcoming | "new" | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const list = items ? openItems(items) : [];

  async function done(item: Upcoming) {
    setRowError(null);
    setBusyId(item.id);
    try {
      const r = await onDone(item);
      if (r && r.error) setRowError({ id: item.id, text: r.error });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="grid gap-3" aria-label="Upcoming">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold">Upcoming</h2>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="min-h-[44px] rounded-xl bg-accent px-4 font-semibold text-accent-ink"
        >
          Add
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-urgent/40 bg-urgent/10 px-3 py-2 text-sm">
          <span className="flex-1">
            {items ? "Couldn't refresh — this may be out of date." : "Couldn't load upcoming."} ({error})
          </span>
          <button onClick={onRetry} className="font-medium underline">
            Retry
          </button>
        </div>
      )}

      {!items ? (
        <p className="text-sm text-ink-soft">{error ? "" : "Loading…"}</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-ink-soft">Nothing coming up. Add a vet visit, a vaccine or a medication.</p>
      ) : (
        <ul className="grid gap-2">
          {list.map((item) => {
            const tone = upcomingTone(item, today);
            const repeat = repeatText(item.repeat_every, item.repeat_unit);
            return (
              <li
                key={item.id}
                data-status={tone ?? undefined}
                className="lando-pill grid gap-1 rounded-xl border border-line bg-surface px-3 py-2.5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <b className="min-w-0 break-words text-[15px] leading-tight">{item.title}</b>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                    {UPCOMING_LABELS[item.kind]}
                  </span>
                </div>
                <div className="text-[15px] tabular-nums">
                  {dueText(item)}
                  {repeat && <span className="text-ink-soft"> · {repeat}</span>}
                  {tone && <span className="sr-only">, {UPCOMING_TONE_WORDS[tone]}</span>}
                </div>
                {item.note && <p className="break-words text-sm text-ink-soft">{item.note}</p>}
                {rowError?.id === item.id && (
                  <p role="alert" className="text-sm font-semibold text-danger">
                    {rowError.text}
                  </p>
                )}
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void done(item)}
                    className="min-h-[44px] flex-1 rounded-xl bg-accent px-3 font-semibold text-accent-ink disabled:opacity-60"
                  >
                    {busyId === item.id ? "Saving…" : needsVisit(item.kind) ? "Done: log the visit" : "Done"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(item)}
                    className="min-h-[44px] rounded-xl border border-line bg-raised px-4 font-semibold"
                  >
                    Edit
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <Sheet title={editing === "new" ? "Add upcoming" : "Edit upcoming"} onClose={() => setEditing(null)}>
          <ItemForm
            key={editing === "new" ? "new" : editing.id}
            item={editing === "new" ? null : editing}
            today={today}
            onSave={async (value) => {
              const r = await onSave(value, editing === "new" ? undefined : editing.id);
              if (!r.error) setEditing(null);
              return r;
            }}
            onCancel={
              editing === "new"
                ? undefined
                : async () => {
                    const r = await onCancel(editing.id);
                    if (!r.error) setEditing(null);
                    return r;
                  }
            }
          />
        </Sheet>
      )}
    </section>
  );
}

function ItemForm({
  item,
  today,
  onSave,
  onCancel,
}: {
  item: Upcoming | null;
  today: string;
  onSave: (value: UpcomingInput) => Promise<Result>;
  onCancel?: () => Promise<Result>;
}) {
  const [kind, setKind] = useState<UpcomingKind>(item?.kind ?? "vet");
  const [title, setTitle] = useState(item?.title ?? "");
  const [dueOn, setDueOn] = useState(item?.due_on ?? today);
  const [time, setTime] = useState(item?.due_time ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const [repeats, setRepeats] = useState(!!item?.repeat_every);
  const [every, setEvery] = useState(String(item?.repeat_every ?? 1));
  const [unit, setUnit] = useState<RepeatUnit>(item?.repeat_unit ?? "month");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const submitting = useRef(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    setError(null);
    const n = Number(every);
    if (repeats && (!Number.isInteger(n) || n < 1 || n > REPEAT_MAX)) {
      setError(`Repeat every a whole number from 1 to ${REPEAT_MAX}`);
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const r = await onSave({
        kind,
        title: title.trim(),
        due_on: dueOn,
        due_time: time || null,
        note: note.trim() || null,
        repeat_every: repeats ? n : null,
        repeat_unit: repeats ? unit : null,
      });
      if (r.error) setError(r.error);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function cancel() {
    if (!onCancel) return;
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    setBusy(true);
    const r = await onCancel();
    setBusy(false);
    if (r.error) setError(r.error);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <Field label="Kind" htmlFor="u-kind">
        <select id="u-kind" value={kind} onChange={(e) => setKind(e.target.value as UpcomingKind)} className={input}>
          {UPCOMING_KINDS.map((k) => (
            <option key={k} value={k}>
              {UPCOMING_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="What" htmlFor="u-title">
        <input
          id="u-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_MAX}
          required
          placeholder={kind === "vaccine" ? "Rabies booster" : kind === "medication" ? "Heartworm pill" : "8-week check-up"}
          className={input}
          data-autofocus
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Due" htmlFor="u-due">
          <input id="u-due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} required className={input} />
        </Field>
        <Field label="Time (optional)" htmlFor="u-time">
          <input id="u-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} />
        </Field>
      </div>
      <Field label="Note" htmlFor="u-note">
        <input id="u-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Optional" className={input} />
      </Field>
      <label className="flex min-h-[44px] items-center gap-2">
        <input type="checkbox" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} className="h-5 w-5" />
        <span>Repeats</span>
      </label>
      {repeats && (
        <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
          <span className="text-sm text-ink-soft">Every</span>
          <input
            aria-label="Repeat every"
            type="number"
            inputMode="numeric"
            min={1}
            max={REPEAT_MAX}
            value={every}
            onChange={(e) => setEvery(e.target.value)}
            className={input}
          />
          <select aria-label="Repeat unit" value={unit} onChange={(e) => setUnit(e.target.value as RepeatUnit)} className={input}>
            {REPEAT_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}s
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-[14px] bg-[var(--tone-2-bg)] px-4 py-3 text-lg font-bold text-[var(--tone-2-ink)] shadow-[0_4px_0_var(--tone-2-lip)] active:translate-y-0.5 active:shadow-[0_2px_0_var(--tone-2-lip)] disabled:opacity-60"
      >
        {busy ? "Saving…" : item ? "Save changes" : "Add"}
      </button>
      {onCancel && (
        <button type="button" onClick={cancel} disabled={busy} className="self-start py-1 font-semibold text-danger disabled:opacity-60">
          {confirmCancel ? "Tap again to cancel it" : "Cancel this item"}
        </button>
      )}
    </form>
  );
}
