"use client";

import { useEffect, useRef } from "react";
import { formatAmount } from "@/lib/foods";

const ROW = 40; // px per step; three rows show, the middle one is the pick
const SETTLE_MS = 90;

/**
 * A scroll picker for a food amount (TEC-136), in eighths: a short column that
 * snaps one step at a time, the middle row being the pick. A local pattern,
 * copied from no other app: the native `<select>` opens a full-screen list on
 * a phone, and a typed amount was a keyboard and a fraction to spell.
 *
 * `options` comes from `amountOptions` (`lib/foods.ts`); null is "no amount".
 * It is one `spinbutton` for screen readers and keyboards: arrow keys step,
 * Page keys jump a whole unit, Home and End go to either end. A tap on a row
 * picks it.
 */
export default function AmountScroller({
  id,
  options,
  value,
  onChange,
  label,
}: {
  id?: string;
  options: (number | null)[];
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const index = Math.max(
    0,
    options.findIndex((o) => (o === null ? value === null : value !== null && Math.abs(o - value) < 1e-9))
  );

  // Follow the value when it changes from outside (opening, a type switch, keys).
  useEffect(() => {
    const el = box.current;
    if (el && Math.round(el.scrollTop / ROW) !== index) el.scrollTop = index * ROW;
  }, [index]);

  useEffect(() => () => clearTimeout(settle.current), []);

  function pick(i: number, smooth = false) {
    const j = Math.min(options.length - 1, Math.max(0, i));
    box.current?.scrollTo({ top: j * ROW, behavior: smooth ? "smooth" : "auto" });
    if (j !== index) onChange(options[j]);
  }

  function onScroll() {
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = box.current;
      if (!el) return;
      const j = Math.min(options.length - 1, Math.max(0, Math.round(el.scrollTop / ROW)));
      if (j !== index) onChange(options[j]);
    }, SETTLE_MS);
  }

  function onKey(e: React.KeyboardEvent) {
    const perUnit = 8;
    const step: Record<string, number> = {
      ArrowUp: -1,
      ArrowDown: 1,
      PageUp: -perUnit,
      PageDown: perUnit,
      Home: -options.length,
      End: options.length,
    };
    if (!(e.key in step)) return;
    e.preventDefault();
    pick(index + step[e.key]);
  }

  const text = (o: number | null) => (o === null ? "—" : formatAmount(o));

  return (
    <div className="relative h-[120px] min-w-0 overflow-hidden rounded-[10px] border border-line bg-paper focus-within:border-accent">
      {/* The pick's band, behind the rows. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-1 top-[40px] h-[40px] rounded-lg bg-raised" />
      <div
        id={id}
        ref={box}
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuetext={value === null ? "no amount" : formatAmount(value)}
        aria-valuenow={value ?? undefined}
        onScroll={onScroll}
        onKeyDown={onKey}
        className="relative h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div style={{ height: ROW }} aria-hidden="true" />
        {options.map((o, i) => (
          <div
            key={o ?? "none"}
            aria-hidden="true"
            onClick={() => pick(i, true)}
            style={{ height: ROW }}
            className={`flex snap-center items-center justify-center tabular-nums ${
              i === index ? "text-lg font-bold text-ink" : "text-ink-soft"
            }`}
          >
            {text(o)}
          </div>
        ))}
        <div style={{ height: ROW }} aria-hidden="true" />
      </div>
    </div>
  );
}
