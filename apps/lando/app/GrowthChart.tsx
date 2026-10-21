"use client";

import { useMemo, useState } from "react";
import { displayUnit, fromKg, growthPoints, round1, type JournalEvent } from "@/lib/events";
import { shortDate } from "@/lib/localtime";

/**
 * Weight over time, one series, from live weight events.
 *
 * A local pattern (no chart library in this repo): a plain SVG line with
 * markers, colours read from the theme tokens so it follows livery and
 * polarity. One series, so no legend; the heading names it. Tap or hover
 * shows the nearest weight; the table under it is the same data in words.
 */
const W = 320;
const H = 160;
const PAD = { top: 12, right: 12, bottom: 22, left: 36 };

export default function GrowthChart({ events, since }: { events: JournalEvent[]; since?: Date }) {
  const unit = displayUnit(events);
  const from = since?.getTime() ?? -Infinity;
  const points = useMemo(
    () =>
      growthPoints(events)
        .filter((p) => Date.parse(p.at) >= from)
        .map((p) => ({ ...p, v: round1(fromKg(p.kg, unit)), t: Date.parse(p.at) })),
    [events, unit, from]
  );
  const [active, setActive] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        {since ? "No weigh-ins in this window." : "No weights yet. Tap Weight to log one."}
      </p>
    );
  }

  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const vs = points.map((p) => p.v);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  // Start the axis at zero: a puppy's weight is read as a proportion of itself.
  const yMax = niceCeil(hi * 1.1 || 1);
  const ticks = [0, yMax / 2, yMax];

  const x = (t: number) =>
    t1 === t0 ? PAD.left + (W - PAD.left - PAD.right) / 2 : PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / yMax) * (H - PAD.top - PAD.bottom);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");

  function nearest(clientX: number, rect: DOMRect) {
    const sx = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(points[i].t) - sx) < Math.abs(x(points[best].t) - sx)) best = i;
    setActive(best);
  }

  const a = active === null ? null : points[active];
  const latest = points[points.length - 1];

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        <span className="text-2xl font-semibold tabular-nums">{latest.v}</span> <span className="text-ink-soft">{unit}</span>
        <span className="text-ink-soft"> · {shortDate(latest.at)}</span>
        {points.length > 1 && (
          <span className="text-ink-soft">
            {" "}
            · {lo === hi ? "steady" : `${latest.v >= points[0].v ? "up" : "down"} from ${points[0].v} ${unit} on ${shortDate(points[0].at)}`}
          </span>
        )}
      </p>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none select-none"
          role="img"
          aria-label={`Weight in ${unit}, ${points.length} readings`}
          onPointerMove={(e) => nearest(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => nearest(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setActive(null)}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="rgb(var(--line-rgb))" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="rgb(var(--ink-soft-rgb))">
                {round1(v)}
              </text>
            </g>
          ))}
          <text x={PAD.left} y={H - 6} fontSize={10} fill="rgb(var(--ink-soft-rgb))">
            {shortDate(points[0].at)}
          </text>
          {t1 !== t0 && (
            <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize={10} fill="rgb(var(--ink-soft-rgb))">
              {shortDate(latest.at)}
            </text>
          )}
          {a && (
            <line x1={x(a.t)} x2={x(a.t)} y1={PAD.top} y2={H - PAD.bottom} stroke="rgb(var(--ink-soft-rgb))" strokeWidth={1} strokeDasharray="2 3" />
          )}
          <path d={path} fill="none" stroke="rgb(var(--accent-rgb))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <circle
              key={p.id}
              cx={x(p.t)}
              cy={y(p.v)}
              r={i === active ? 5 : 4}
              fill="rgb(var(--accent-rgb))"
              stroke="rgb(var(--surface-rgb))"
              strokeWidth={2}
            />
          ))}
        </svg>
        {a && (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border border-line bg-raised px-2 py-1 text-xs shadow-sm"
            style={{ left: `${Math.min(85, Math.max(15, (x(a.t) / W) * 100))}%` }}
          >
            <span className="font-semibold tabular-nums">
              {a.v} {unit}
            </span>{" "}
            <span className="text-ink-soft">{shortDate(a.at)}</span>
          </div>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-ink-soft">Weights as a table</summary>
        <table className="mt-2 w-full tabular-nums">
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="py-1 text-ink-soft">{shortDate(p.at)}</td>
                <td className="py-1 text-right">
                  {p.v} {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** The next round number at or above n: 1, 2, 2.5, 5 or 10 times a power of ten. */
function niceCeil(n: number): number {
  const p = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= n) return m * p;
  return 10 * p;
}
