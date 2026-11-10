"use client";

import { useEffect, useRef } from "react";
import { clock12, dateLabel, withClock, withDay } from "@/lib/localtime";
import { input } from "./LogForm";

const ROW = 42; // px: one row fills the 44px box inside its 1px border
const SETTLE_MS = 90;

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS = ["AM", "PM"];

/**
 * One column of the time box: a single row shows, and a swipe scrolls it in place, snapping a row at a time.
 * AmountScroller's pattern (a scroll box that settles on a row, one `spinbutton` for keys and screen readers),
 * sized to sit inside the 44px field with no border of its own. Arrow keys step, Page keys jump, Home and End go
 * to either end.
 */
function TimeColumn({
  label,
  texts,
  index,
  jump,
  width,
  onIndex,
}: {
  label: string;
  texts: string[];
  index: number;
  /** How far the Page keys move. */
  jump: number;
  width: number;
  onIndex: (i: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Follow the value when it changes from outside (opening, a key, the other columns).
  useEffect(() => {
    const el = box.current;
    if (el && Math.round(el.scrollTop / ROW) !== index) el.scrollTop = index * ROW;
  }, [index]);
  useEffect(() => () => clearTimeout(settle.current), []);

  const clamp = (i: number) => Math.min(texts.length - 1, Math.max(0, i));

  function onScroll() {
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = box.current;
      if (!el) return;
      const j = clamp(Math.round(el.scrollTop / ROW));
      if (j !== index) onIndex(j);
    }, SETTLE_MS);
  }

  function onKey(e: React.KeyboardEvent) {
    const step: Record<string, number> = {
      ArrowUp: -1,
      ArrowDown: 1,
      PageUp: -jump,
      PageDown: jump,
      Home: -texts.length,
      End: texts.length,
    };
    if (!(e.key in step)) return;
    e.preventDefault();
    const j = clamp(index + step[e.key]);
    if (j !== index) onIndex(j);
  }

  return (
    <div
      ref={box}
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={texts.length - 1}
      aria-valuenow={index}
      aria-valuetext={texts[index]}
      onScroll={onScroll}
      onKeyDown={onKey}
      style={{ height: ROW, width }}
      className="shrink-0 snap-y snap-mandatory overflow-y-scroll overscroll-contain rounded-md outline-none [scrollbar-width:none] focus-visible:bg-raised [&::-webkit-scrollbar]:hidden"
    >
      {texts.map((t) => (
        <div key={t} aria-hidden="true" style={{ height: ROW }} className="flex snap-center items-center justify-center whitespace-nowrap text-[15px] tabular-nums">
          {t}
        </div>
      ))}
    </div>
  );
}

/**
 * The When row's field (TEC-261, the owner's option A): a day box and one time box, side by side.
 *
 * The day box reads "Today" (or the entry's day) and holds a transparent `date` input over all of it, so a tap
 * anywhere opens the calendar; `showPicker()` is called on the tap too, for the browsers that need it. The time
 * box is drawn like the original 44px field, with the hour, the minute and AM or PM each scrolling in place. A
 * Weight is a day only, so it has no time box. `value` is `YYYY-MM-DD` for a day-only field, else a local
 * date-and-time (`YYYY-MM-DDTHH:mm`); `onChange` hands back the same shape. A local pattern.
 */
export default function WhenField({
  value,
  dateOnly,
  maxDay,
  onChange,
}: {
  value: string;
  dateOnly: boolean;
  /** The last day the calendar offers (a note is never in the future). */
  maxDay?: string;
  onChange: (value: string) => void;
}) {
  const day = value.slice(0, 10);
  const c = clock12(value);
  const hourIndex = HOURS.indexOf(c.hour);

  return (
    <div className="flex items-center gap-1">
      {/* The day box: the shared field's border and height (`input`), its padding moved to the face so the input can cover it all. */}
      <div className={`${input} relative flex-1 !p-0 focus-within:border-accent`}>
        <span aria-hidden="true" className="block truncate px-2.5 leading-[42px]">
          {dateLabel(day, new Date())}
        </span>
        <input
          type="date"
          aria-label="Date"
          value={day}
          max={maxDay}
          onChange={(e) => {
            if (e.target.value) onChange(dateOnly ? e.target.value : withDay(value, e.target.value));
          }}
          onClick={(e) => {
            try {
              e.currentTarget.showPicker?.();
            } catch {
              // Not every browser lets a script open it; the tap on the input itself still does.
            }
          }}
          className="absolute inset-0 h-full w-full min-w-0 cursor-pointer opacity-0"
        />
      </div>
      {!dateOnly && (
        <div role="group" aria-label="Time" className="flex h-[44px] shrink-0 items-center overflow-hidden rounded-[10px] border border-line bg-surface px-1.5 focus-within:border-accent">
          <TimeColumn label="Hour" texts={HOURS.map(String)} index={hourIndex} jump={3} width={22} onIndex={(i) => onChange(withClock(value, { ...c, hour: HOURS[i] }))} />
          <span aria-hidden="true" className="shrink-0 text-[15px] text-ink-soft">
            :
          </span>
          <TimeColumn
            label="Minute"
            texts={MINUTES.map((m) => String(m).padStart(2, "0"))}
            index={c.minute}
            jump={5}
            width={24}
            onIndex={(i) => onChange(withClock(value, { ...c, minute: MINUTES[i] }))}
          />
          <TimeColumn label="AM or PM" texts={PERIODS} index={c.pm ? 1 : 0} jump={1} width={30} onIndex={(i) => onChange(withClock(value, { ...c, pm: i === 1 }))} />
        </div>
      )}
    </div>
  );
}
