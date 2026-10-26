"use client";

import { useState } from "react";

/**
 * One column per day, oldest left, today right (TEC-143), for a duration per day
 * in minutes: an optional bar, an optional dot, and optional small diamonds
 * (one per event). A local pattern, plain SVG like the growth chart, used for
 * the potty gaps (bar = longest, dot = average) and meal to poop (diamonds =
 * each meal, dot = the day's median). Shapes differ as well as colours. Tap a
 * day for its numbers in words under the chart; a day with nothing is a gap.
 */
export type DailyColumn = {
  start: Date;
  bar?: number | null;
  dot?: number | null;
  extra?: number[];
  /** What a tap says for this day. */
  text: string;
};

const W = 340;
const H = 150;
const PAD = { top: 10, right: 6, bottom: 22, left: 30 };
const HOUR = 60;

const hours = (min: number) => (min % HOUR ? `${Math.round((min / HOUR) * 10) / 10}h` : `${min / HOUR}h`);

export default function DailyChart({
  cols,
  legend,
  label,
}: {
  cols: DailyColumn[];
  legend: { shape: "bar" | "dot" | "diamond"; label: string }[];
  label: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const top = Math.max(0, ...cols.flatMap((c) => [c.bar ?? 0, c.dot ?? 0, ...(c.extra ?? [])]));
  const yMax = Math.max(2 * HOUR, Math.ceil(top / HOUR) * HOUR);
  const bw = (W - PAD.left - PAD.right) / cols.length;
  const y = (v: number) => PAD.top + (1 - v / yMax) * (H - PAD.top - PAD.bottom);
  const cx = (i: number) => PAD.left + i * bw + bw / 2;
  const last = cols.length - 1;
  const day = (c: DailyColumn) => c.start.toLocaleDateString([], { month: "numeric", day: "numeric" });
  const s1 = "var(--lando-series-1)";
  const s2 = "var(--lando-series-2)";
  const s3 = "var(--lando-series-3)";
  const edge = "rgb(var(--surface-rgb))";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[13px] text-ink-soft">
        {legend.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden="true" className="block">
              {l.shape === "bar" && <rect x={1.5} y={0.5} width={7} height={9} rx={1.5} fill={s3} />}
              {l.shape === "dot" && <circle cx={5} cy={5} r={4.4} fill={s1} stroke={edge} strokeWidth={0.8} />}
              {l.shape === "diamond" && <path d="M5 0.2 L9.8 5 L5 9.8 L0.2 5 Z" fill={s2} />}
            </svg>
            {l.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-manipulation select-none" role="img" aria-label={`${label}, last ${cols.length} days`}>
        {[0, yMax / 2, yMax].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="rgb(var(--line-rgb))" strokeOpacity={0.45} />
            <text x={PAD.left - 4} y={y(v) + 4} fontSize={10} textAnchor="end" fill="rgb(var(--ink-soft-rgb))">
              {hours(v)}
            </text>
          </g>
        ))}
        {cols.map((c, i) => (
          <g key={c.start.getTime()} onClick={() => setActive(active === i ? null : i)} className="cursor-pointer">
            <rect x={PAD.left + i * bw} y={PAD.top} width={bw} height={H - PAD.top - PAD.bottom} fill={active === i ? "rgb(var(--surface-raised-rgb))" : "transparent"} rx={2} />
            {c.bar != null && (
              <rect x={PAD.left + i * bw + 3} width={bw - 6} y={y(c.bar)} height={Math.max(1, y(0) - y(c.bar))} fill={s3} rx={1.5} />
            )}
            {(c.extra ?? []).map((v, j) => (
              <path
                key={j}
                d={`M${cx(i)} ${y(v) - 3.5} L${cx(i) + 3.5} ${y(v)} L${cx(i)} ${y(v) + 3.5} L${cx(i) - 3.5} ${y(v)} Z`}
                fill={s2}
                stroke={edge}
                strokeWidth={0.8}
              />
            ))}
            {c.dot != null && <circle cx={cx(i)} cy={y(c.dot)} r={4.5} fill={s1} stroke={edge} strokeWidth={1.2} />}
            {(i % 3 === 1 || i === last) && (
              <text x={cx(i)} y={H - 6} fontSize={10} textAnchor="middle" fill="rgb(var(--ink-soft-rgb))">
                {i === last ? "today" : day(c)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <p className="min-h-[1.25rem] text-[13px] tabular-nums text-ink-soft" aria-live="polite">
        {active === null ? "Tap a day for its numbers." : `${active === last ? "Today" : day(cols[active])}: ${cols[active].text}`}
      </p>
    </div>
  );
}
