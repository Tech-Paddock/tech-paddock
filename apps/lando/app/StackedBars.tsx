"use client";

import { useState } from "react";
import type { Count, DayRow } from "@/lib/analytics";

export type Series = { key: Count; label: string; color: string };

/**
 * Counts per day as stacked bars, oldest left, today right. Plain SVG, like
 * the growth chart: a local pattern, no chart library. Colours are the
 * `--lando-series-*` variables in globals.css, which read the theme's tokens.
 *
 * Tap a bar for that day's numbers; the line under the chart says them in
 * words, so the chart is never the only way to read a value.
 */
const W = 340;
const H = 150;
const PAD = { top: 8, right: 4, bottom: 22, left: 24 };

export default function StackedBars({ rows, series, label }: { rows: DayRow[]; series: Series[]; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  const totals = rows.map((r) => series.reduce((s, k) => s + r[k.key], 0));
  const yMax = Math.max(4, Math.ceil(Math.max(...totals) / 4) * 4);
  const bw = (W - PAD.left - PAD.right) / rows.length;
  const y = (v: number) => PAD.top + (1 - v / yMax) * (H - PAD.top - PAD.bottom);
  const day = (r: DayRow) => r.start.toLocaleDateString([], { month: "numeric", day: "numeric" });
  const last = rows.length - 1;
  const a = active === null ? null : rows[active];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[13px] text-ink-soft">
        {series.map((s) => (
          <span key={s.key} className="whitespace-nowrap">
            <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] align-[-1px]" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-manipulation select-none"
        role="img"
        aria-label={`${label}, last ${rows.length} days`}
      >
        {[0, yMax / 2, yMax].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="rgb(var(--line-rgb))" strokeOpacity={0.45} />
            <text x={PAD.left - 4} y={y(v) + 4} fontSize={10} textAnchor="end" fill="rgb(var(--ink-soft-rgb))">
              {v}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          let base = 0;
          return (
            <g key={r.start.getTime()} onClick={() => setActive(active === i ? null : i)} className="cursor-pointer">
              {/* The whole column is the tap target, not just the inked part. */}
              <rect x={PAD.left + i * bw} y={PAD.top} width={bw} height={H - PAD.top - PAD.bottom} fill="transparent" />
              {active === i && (
                <rect
                  x={PAD.left + i * bw + 0.5}
                  y={PAD.top}
                  width={bw - 1}
                  height={H - PAD.top - PAD.bottom}
                  fill="rgb(var(--surface-raised-rgb))"
                  rx={2}
                />
              )}
              {series.map((s) => {
                const v = r[s.key];
                if (!v) return null;
                const top = y(base + v);
                const h = y(base) - top;
                base += v;
                return (
                  <rect
                    key={s.key}
                    x={PAD.left + i * bw + 2}
                    width={bw - 4}
                    y={top}
                    height={h}
                    fill={s.color}
                    stroke="rgb(var(--surface-rgb))"
                    strokeWidth={1}
                    rx={1.5}
                  />
                );
              })}
              {(i % 3 === 1 || i === last) && (
                <text x={PAD.left + i * bw + bw / 2} y={H - 6} fontSize={10} textAnchor="middle" fill="rgb(var(--ink-soft-rgb))">
                  {i === last ? "today" : day(r)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="min-h-[1.25rem] text-[13px] tabular-nums text-ink-soft" aria-live="polite">
        {a
          ? `${active === last ? "Today" : day(a)}: ${series.map((s) => `${a[s.key]} ${s.label.toLowerCase()}`).join(", ")}`
          : "Tap a day for its numbers."}
      </p>
    </div>
  );
}
