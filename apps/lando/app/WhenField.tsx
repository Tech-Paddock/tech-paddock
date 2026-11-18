"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { clock12, dateLabel, fromDateInput, localMidnight, toDateInput, toLocalInput, withClock, withDay } from "@/lib/localtime";
import {
  QUICK_AGO,
  clampTo,
  dayDisabled,
  hourDisabled,
  minuteDisabled,
  minuteOptions,
  monthCells,
  pmDisabled,
  quickValue,
  shiftMonth,
} from "@/lib/whenpick";
import { Field, input } from "./fields";
import Chip from "./Chip";

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** "Today", "Yesterday", "Tomorrow", else the date: the face of the Day box. */
function dayText(day: string, now: Date): string {
  const iso = fromDateInput(day);
  if (iso) {
    const diff = Math.round((localMidnight(new Date(iso)).getTime() - localMidnight(now).getTime()) / 86_400_000);
    if (diff === 1) return "Tomorrow";
  }
  return dateLabel(day, now);
}

/** "2:35 PM": the face of the Time box. */
function clockText(value: string): string {
  const c = clock12(value);
  return `${c.hour}:${String(c.minute).padStart(2, "0")} ${c.pm ? "PM" : "AM"}`;
}

/** Whether a form that can't be in the future (Potty, a note) holds a time after now: the latest it may hold is now. */
const maxFor = (noFuture: boolean, now: Date): string | undefined => (noFuture ? toLocalInput(now.toISOString()) : undefined);

/**
 * A pop-up window over the sheet, not a panel that opens down it (the owner, 2026-11-17): a dimmed backdrop and a
 * centred panel, drawn into `<body>` above the sheet. Nothing in it scrolls and everything in it is `select-none`, so a
 * hold or a drag never selects the page behind it. Page scroll is locked while it is open. Escape and a tap on the
 * backdrop cancel (Escape is kept from the sheet below, which would close the whole form). Focus moves in, and goes back
 * to the box that opened it. A local pattern.
 */
function Popup({
  title,
  summary,
  opener,
  onCancel,
  children,
}: {
  title: string;
  summary: string;
  opener: RefObject<HTMLElement | null>;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const cancel = useRef(onCancel);
  cancel.current = onCancel;

  useEffect(() => {
    const back = opener.current;
    panel.current?.querySelector<HTMLElement>("button:not([disabled]), select:not([disabled])")?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      cancel.current();
    };
    document.addEventListener("keydown", key, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key, true);
      document.body.style.overflow = overflow;
      back?.focus?.({ preventScroll: true });
    };
    // Once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-bar/60 p-4" data-backdrop onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm select-none rounded-[18px] border-t-4 border-pinstripe bg-surface p-3 shadow-[0_12px_40px_rgb(0_0_0_/_0.35)]"
      >
        <div className="grid gap-2">
          <header className="flex items-center justify-between gap-3">
            <h3 id={titleId} className="text-xl font-bold leading-tight">
              {title}
            </h3>
            <span className="text-[15px] tabular-nums text-ink-soft">{summary}</span>
          </header>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

const cancelButton = "min-h-[44px] rounded-[12px] border border-line bg-surface px-4 text-[15px]";

/** The box a pop-up opens from: the shared field's height and border, its face, and a small arrow. */
function Trigger({ id, text, label, open, onOpen, btn }: { id: string; text: string; label: string; open: boolean; onOpen: () => void; btn: RefObject<HTMLButtonElement | null> }) {
  return (
    <button
      ref={btn}
      id={id}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`${label}: ${text}`}
      onClick={onOpen}
      className={`${input} flex w-full select-none items-center justify-between gap-1 text-left`}
    >
      <span className="truncate tabular-nums">{text}</span>
      <span aria-hidden="true" className="text-ink-soft">
        ▾
      </span>
    </button>
  );
}

/**
 * The Day box (the owner, 2026-11-17, replacing the scroll wheel of TEC-261): it reads the day and opens a month
 * calendar in a pop-up; a tap on a day picks it and closes. Today is ringed. With `noFuture` (Potty, a note) later days
 * are greyed out and the calendar will not go to a later month. `value` is a local date-and-time
 * (`YYYY-MM-DDTHH:mm`), or `YYYY-MM-DD` for a day-only field (a Weight, a next dose); `onChange` hands back the same
 * shape. Picking a day keeps the clock, and for `noFuture` a time that would then be after now becomes now. A local
 * pattern.
 */
export function DayField({
  value,
  dateOnly,
  noFuture = false,
  label = "Day",
  onChange,
}: {
  value: string;
  dateOnly: boolean;
  noFuture?: boolean;
  label?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const day = value.slice(0, 10);
  const now = new Date();
  const max = maxFor(noFuture, now);
  const [shown, setShown] = useState(() => shiftMonth(day, 0));
  const today = toDateInput(now.toISOString());

  function show() {
    setShown(shiftMonth(/^\d{4}-\d{2}-\d{2}$/.test(day) ? day : today, 0));
    setOpen(true);
  }
  function pick(d: string) {
    onChange(dateOnly ? d : clampTo(withDay(value, d), max));
    setOpen(false);
  }
  const firstOf = (m: { year: number; month: number }) => `${m.year}-${String(m.month + 1).padStart(2, "0")}-01`;
  const step = (by: number) => setShown((s) => shiftMonth(firstOf(s), by));
  const nextFirst = firstOf(shiftMonth(firstOf(shown), 1));

  return (
    <Field label={label} htmlFor={id}>
      <Trigger id={id} btn={btn} label={label} open={open} onOpen={show} text={dayText(day, now)} />
      {open && (
        <Popup title={label} summary={dayText(day, now)} opener={btn} onCancel={() => setOpen(false)}>
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => step(-1)} aria-label="Previous month" className="grid h-11 w-11 place-items-center rounded-full bg-raised text-[18px]">
              ‹
            </button>
            <span aria-live="polite" className="text-[15px] font-semibold">
              {new Date(shown.year, shown.month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </span>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={dayDisabled(nextFirst, max)}
              aria-label="Next month"
              className="grid h-11 w-11 place-items-center rounded-full bg-raised text-[18px] disabled:opacity-30"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((w, i) => (
              <span key={i} aria-hidden="true" className="text-[11px] uppercase tracking-[0.06em] text-ink-soft">
                {w}
              </span>
            ))}
            {monthCells(shown.year, shown.month).map((c, i) =>
              c ? (
                <button
                  key={c.day}
                  type="button"
                  disabled={dayDisabled(c.day, max)}
                  aria-pressed={c.day === day}
                  aria-label={new Date(shown.year, shown.month, c.n).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                  onClick={() => pick(c.day)}
                  className={`grid h-11 place-items-center rounded-full text-[15px] tabular-nums disabled:opacity-30 ${
                    c.day === day ? "bg-accent font-bold text-accent-ink" : c.day === today ? "border border-accent font-bold" : ""
                  }`}
                >
                  {c.n}
                </button>
              ) : (
                <span key={`b${i}`} />
              )
            )}
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={() => setOpen(false)} className={cancelButton}>
              Cancel
            </button>
          </div>
        </Popup>
      )}
    </Field>
  );
}

const picklist = `${input} w-[64px] text-center tabular-nums`;

/**
 * The Time box: it reads the time and opens a pop-up of Now, 15, 30 and 45 min ago and 1 hr ago, then the hour, the
 * minute (in five-minute steps) and AM or PM as native picklists, with Cancel and Done. Nothing is applied until Done;
 * Cancel leaves the time as it was. With `noFuture` (Potty, a note) the hours, minutes and PM after now on today are
 * greyed out. `value` and `onChange` are a local date-and-time (`YYYY-MM-DDTHH:mm`). A local pattern.
 */
export function TimeField({ value, noFuture = false, onChange }: { value: string; noFuture?: boolean; onChange: (value: string) => void }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const now = new Date();
  const max = maxFor(noFuture, now);
  const c = clock12(draft);

  function show() {
    setDraft(value);
    setOpen(true);
  }
  const set = (next: { hour: number; minute: number; pm: boolean }) => setDraft(clampTo(withClock(draft, next), max));

  return (
    <Field label="Time" htmlFor={id}>
      <Trigger id={id} btn={btn} label="Time" open={open} onOpen={show} text={clockText(value)} />
      {open && (
        <Popup title="Time" summary={`${dayText(draft.slice(0, 10), now)} · ${clockText(draft)}`} opener={btn} onCancel={() => setOpen(false)}>
          <div role="group" aria-label="How long ago" className="flex flex-wrap gap-x-1">
            {QUICK_AGO.map(([ago, text]) => (
              <Chip key={ago} pressed={draft === quickValue(ago, now)} onClick={() => setDraft(quickValue(ago, now))}>
                {text}
              </Chip>
            ))}
          </div>
          <div className="flex justify-center gap-1.5">
            <select aria-label="Hour" value={c.hour} onChange={(e) => set({ ...c, hour: Number(e.target.value) })} className={picklist}>
              {HOURS.map((h) => (
                <option key={h} value={h} disabled={hourDisabled(draft, max, h, c.pm)}>
                  {h}
                </option>
              ))}
            </select>
            <select aria-label="Minute" value={c.minute} onChange={(e) => set({ ...c, minute: Number(e.target.value) })} className={picklist}>
              {minuteOptions(c.minute).map((m) => (
                <option key={m} value={m} disabled={minuteDisabled(draft, max, m) && m !== c.minute}>
                  :{String(m).padStart(2, "0")}
                </option>
              ))}
            </select>
            <select aria-label="AM or PM" value={c.pm ? "1" : "0"} onChange={(e) => set({ ...c, pm: e.target.value === "1" })} className={picklist}>
              <option value="0">AM</option>
              <option value="1" disabled={pmDisabled(draft, max)}>
                PM
              </option>
            </select>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className={cancelButton}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
              className="h-[44px] rounded-[12px] bg-[var(--tone-2-bg)] px-5 text-[15px] font-bold text-[var(--tone-2-ink)] shadow-[0_3px_0_var(--tone-2-lip)] active:translate-y-0.5 active:shadow-[0_1px_0_var(--tone-2-lip)]"
            >
              Done
            </button>
          </div>
        </Popup>
      )}
    </Field>
  );
}
