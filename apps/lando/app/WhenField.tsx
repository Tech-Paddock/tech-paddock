"use client";

import { useEffect, useRef } from "react";
import { DATE_ONLY_HOUR, clock12, dateLabel, fromDateInput, localMidnight, toDateInput, withClock, withDay } from "@/lib/localtime";
import { input } from "./LogForm";

const BOX = 42; // px: the column fills the 44px box inside its 1px border
const ROW = 20; // px: a short row, so the rows either side peek out above and below the chosen one
const PAD = (BOX - ROW) / 2; // px of empty space above the first row and below the last, so either end can sit in the middle
const SETTLE_MS = 90;
const NUDGE_PX = 16; // how far a column rolls when the form opens
const NUDGE_STAGGER_MS = 140;
const NUDGE_START_MS = 280; // after the sheet has risen
const NUDGE_OUT_MS = 230;
const NUDGE_BACK_MS = 260;
const FADE = "linear-gradient(to bottom, transparent 0%, #000 32%, #000 68%, transparent 100%)";

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS = ["AM", "PM"];
/** The day column lists about two weeks back and a month ahead; a tap on it opens the calendar for any other day. */
const DAYS_BACK = 14;
const DAYS_AHEAD = 30;

type Item = { key: string; text: string };

/**
 * One scroll column of the When row: the chosen row sits in the middle at full size and the rows either side peek
 * out, smaller and in soft ink, fading at the top and bottom edges. A swipe scrolls it, snapping a row at a time.
 * AmountScroller's pattern (a scroll box that settles on a row, one `spinbutton` for keys and screen readers),
 * sized to sit inside the 44px field with no border of its own. Arrow keys step, Page keys jump, Home and End go
 * to either end. When the form opens it rolls a little and settles back, once, after `nudgeAfter` ms (never when
 * motion is reduced). `onTap` is a plain tap, which is not a scroll.
 */
function ScrollColumn({
  label,
  items,
  index,
  jump,
  width,
  nudgeAfter,
  onIndex,
  onTap,
}: {
  label: string;
  items: Item[];
  index: number;
  /** How far the Page keys move. */
  jump: number;
  /** Fixed px, or omitted to fill the space. */
  width?: number;
  /** Milliseconds after opening before this column rolls; omitted for no nudge. */
  nudgeAfter?: number;
  onIndex: (i: number) => void;
  /** A tap that did not scroll (and Enter or Space). */
  onTap?: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const nudge = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nudging = useRef(false);
  const indexNow = useRef(index);
  indexNow.current = index;
  const count = items.length;

  const stopNudge = () => {
    nudge.current.forEach(clearTimeout);
    nudge.current = [];
    if (!nudging.current) return;
    nudging.current = false;
    const el = box.current;
    if (el) {
      el.style.scrollSnapType = "";
      el.scrollTop = indexNow.current * ROW;
    }
  };

  // Follow the value when it changes from outside (opening, a key, the other columns).
  useEffect(() => {
    const el = box.current;
    if (el && !nudging.current && Math.round(el.scrollTop / ROW) !== index) el.scrollTop = index * ROW;
  }, [index, count]);
  useEffect(() => () => clearTimeout(settle.current), []);

  // The nudge: once, when the form opens. Snap is off while it rolls, and the scroll events it makes are not a pick.
  useEffect(() => {
    const el = box.current;
    if (nudgeAfter === undefined || !el || typeof el.scrollTo !== "function") return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timers = nudge.current;
    timers.push(
      setTimeout(() => {
        const home = indexNow.current * ROW;
        const dir = indexNow.current >= count - 1 ? -1 : 1;
        nudging.current = true;
        el.style.scrollSnapType = "none";
        el.scrollTo({ top: home + dir * NUDGE_PX, behavior: "smooth" });
        timers.push(
          setTimeout(() => {
            el.scrollTo({ top: home, behavior: "smooth" });
            timers.push(setTimeout(stopNudge, NUDGE_BACK_MS));
          }, NUDGE_OUT_MS),
        );
      }, nudgeAfter),
    );
    return () => {
      timers.forEach(clearTimeout);
      nudging.current = false;
    };
    // Once per opening: the column mounts with the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clamp = (i: number) => Math.min(count - 1, Math.max(0, i));

  function onScroll() {
    if (nudging.current) return;
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = box.current;
      if (!el) return;
      const j = clamp(Math.round(el.scrollTop / ROW));
      if (j !== index) onIndex(j);
    }, SETTLE_MS);
  }

  function onKey(e: React.KeyboardEvent) {
    stopNudge();
    if (onTap && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onTap();
      return;
    }
    const step: Record<string, number> = {
      ArrowUp: -1,
      ArrowDown: 1,
      PageUp: -jump,
      PageDown: jump,
      Home: -count,
      End: count,
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
      aria-valuemax={count - 1}
      aria-valuenow={index}
      aria-valuetext={items[index]?.text}
      onScroll={onScroll}
      onKeyDown={onKey}
      onPointerDown={stopNudge}
      onWheel={stopNudge}
      onClick={onTap}
      style={{ height: BOX, width, WebkitMaskImage: FADE, maskImage: FADE }}
      className={`${width === undefined ? "min-w-0 flex-1 cursor-pointer" : "shrink-0"} snap-y snap-mandatory overflow-y-scroll overscroll-contain rounded-md outline-none [scrollbar-width:none] focus-visible:bg-raised [&::-webkit-scrollbar]:hidden`}
    >
      <div aria-hidden="true" style={{ height: PAD }} />
      {items.map((it, i) => (
        <div
          key={it.key}
          aria-hidden="true"
          style={{ height: ROW }}
          className={`flex snap-center items-center justify-center whitespace-nowrap tabular-nums ${i === index ? "text-[15px]" : "text-[11px] text-ink-soft"}`}
        >
          {it.text}
        </div>
      ))}
      <div aria-hidden="true" style={{ height: PAD }} />
    </div>
  );
}

const asItems = (texts: string[]): Item[] => texts.map((t) => ({ key: t, text: t }));
const HOUR_ITEMS = asItems(HOURS.map(String));
const MINUTE_ITEMS = asItems(MINUTES.map((m) => String(m).padStart(2, "0")));
const PERIOD_ITEMS = asItems(PERIODS);

/** "Yesterday", "Today", "Tomorrow", else the date. */
function dayText(day: string, now: Date): string {
  const iso = fromDateInput(day);
  if (iso) {
    const diff = Math.round((localMidnight(new Date(iso)).getTime() - localMidnight(now).getTime()) / 86_400_000);
    if (diff === 1) return "Tomorrow";
  }
  return dateLabel(day, now);
}

/** The days the column lists: two weeks back to a month ahead (no later than `maxDay`), plus the chosen day if it lies outside. */
function dayItems(chosen: string, now: Date, maxDay?: string): Item[] {
  const days: string[] = [];
  for (let k = -DAYS_BACK; k <= DAYS_AHEAD; k++) {
    const day = toDateInput(new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, DATE_ONLY_HOUR).toISOString());
    if (!maxDay || day <= maxDay) days.push(day);
  }
  if (chosen && !days.includes(chosen)) {
    days.push(chosen);
    days.sort();
  }
  return days.map((d) => ({ key: d, text: dayText(d, now) }));
}


/**
 * The When row's field (TEC-261, the owner's option A; TEC-266 made it show it scrolls): a day box and one time box,
 * side by side. Both are scroll columns that peek, and roll a little when the form opens.
 *
 * The day box is a column of Yesterday, Today, Tomorrow and the dates around them; scrolling sets the day. A plain
 * tap on it, without scrolling, opens the calendar for a day further away: a transparent `date` input sits
 * underneath (it holds the value for the calendar and for assistive tech, and is not touchable, so it never blocks
 * a swipe), and `showPicker()` is called on the tap, for the browsers that need it. The time box is drawn like the
 * original 44px field, with the hour, the minute and AM or PM each scrolling in place. A Weight is a day only, so it
 * has no time box. `value` is `YYYY-MM-DD` for a day-only field, else a local date-and-time (`YYYY-MM-DDTHH:mm`);
 * `onChange` hands back the same shape. A local pattern.
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
  const calendar = useRef<HTMLInputElement>(null);
  const days = dayItems(day, new Date(), maxDay);
  const dayIndex = Math.max(
    0,
    days.findIndex((d) => d.key === day),
  );

  function setDay(d: string) {
    if (d) onChange(dateOnly ? d : withDay(value, d));
  }

  function openCalendar() {
    const el = calendar.current;
    if (!el) return;
    try {
      if (el.showPicker) el.showPicker();
      else el.click();
    } catch {
      // Not every browser lets a script open it; the day column still scrolls.
    }
  }

  return (
    <div className="flex items-center gap-1">
      {/* The day box: the shared field's border and height (`input`), its padding moved off so the column can fill it. */}
      <div className={`${input} relative flex flex-1 items-center overflow-hidden !p-0 focus-within:border-accent`}>
        <ScrollColumn label="Day" items={days} index={dayIndex} jump={7} nudgeAfter={NUDGE_START_MS} onIndex={(i) => setDay(days[i].key)} onTap={openCalendar} />
        <input
          ref={calendar}
          type="date"
          aria-label="Date"
          tabIndex={-1}
          value={day}
          max={maxDay}
          onChange={(e) => setDay(e.target.value)}
          className="pointer-events-none absolute inset-0 h-full w-full min-w-0 opacity-0"
        />
      </div>
      {!dateOnly && (
        <div role="group" aria-label="Time" className="flex h-[44px] shrink-0 items-center overflow-hidden rounded-[10px] border border-line bg-surface px-1.5 focus-within:border-accent">
          <ScrollColumn
            label="Hour"
            items={HOUR_ITEMS}
            index={hourIndex}
            jump={3}
            width={22}
            nudgeAfter={NUDGE_START_MS + NUDGE_STAGGER_MS}
            onIndex={(i) => onChange(withClock(value, { ...c, hour: HOURS[i] }))}
          />
          <span aria-hidden="true" className="shrink-0 text-[15px] text-ink-soft">
            :
          </span>
          <ScrollColumn
            label="Minute"
            items={MINUTE_ITEMS}
            index={c.minute}
            jump={5}
            width={24}
            nudgeAfter={NUDGE_START_MS + 2 * NUDGE_STAGGER_MS}
            onIndex={(i) => onChange(withClock(value, { ...c, minute: MINUTES[i] }))}
          />
          <ScrollColumn
            label="AM or PM"
            items={PERIOD_ITEMS}
            index={c.pm ? 1 : 0}
            jump={1}
            width={30}
            nudgeAfter={NUDGE_START_MS + 3 * NUDGE_STAGGER_MS}
            onIndex={(i) => onChange(withClock(value, { ...c, pm: i === 1 }))}
          />
        </div>
      )}
    </div>
  );
}
