"use client";

import { useState } from "react";
import type { FoodWeight } from "@/lib/analytics";
import { formatAmount, unitLabel } from "@/lib/foods";

/**
 * Meal amount per day above the weight over the same days (TEC-143): two panels
 * sharing one set of day columns, oldest left, so a change in food can be read
 * against a change in weight. Two panels, not two axes on one plot. Amounts
 * only; calories are recorded and never shown. A local pattern, plain SVG.
 *
 * The weight panel's axis runs from the lowest to the highest weigh-in in the
 * window (padded), not from zero as the growth chart's does: over two weeks a
 * puppy's change is small next to its whole weight, and the panel is there to
 * show the direction. The growth chart above it keeps the zero baseline.
 */
const W = 340;
const PAD = { top: 8, right: 6, left: 34 };
const WH = 78; // weight panel
const FH = 78; // food panel
const GAP = 14;
const BOTTOM = 20;
const H = PAD.top + WH + GAP + FH + BOTTOM;

export default function FoodWeightChart({ data }: { data: FoodWeight }) {
  const [active, setActive] = useState<number | null>(null);
  const { days, unit, weightUnit } = data;
  const bw = (W - PAD.left - PAD.right) / days.length;
  const cx = (i: number) => PAD.left + i * bw + bw / 2;
  const last = days.length - 1;

  const ws = days.flatMap((d) => (d.weight === null ? [] : [d.weight]));
  const lo = ws.length ? Math.min(...ws) : 0;
  const hi = ws.length ? Math.max(...ws) : 1;
  const span = Math.max(hi - lo, 0.4);
  const wLo = Math.max(0, lo - span * 0.25);
  const wHi = hi + span * 0.25;
  const wy = (v: number) => PAD.top + (1 - (v - wLo) / (wHi - wLo)) * WH;

  const top = Math.max(0, ...days.map((d) => d.amount));
  const fMax = niceCeil(top || 1);
  const fy0 = PAD.top + WH + GAP + FH;
  const fy = (v: number) => fy0 - (v / fMax) * FH;

  // A line through the weigh-ins; a day without one is bridged, not zero.
  const path = days
    .flatMap((d, i) => (d.weight === null ? [] : [`${cx(i).toFixed(1)},${wy(d.weight).toFixed(1)}`]))
    .map((p, k) => `${k ? "L" : "M"}${p}`)
    .join(" ");
  const day = (i: number) => days[i].start.toLocaleDateString([], { month: "numeric", day: "numeric" });
  const unitText = (n: number) => (unit ? unitLabel(unit, n) : "servings");
  const say = (i: number) => {
    const d = days[i];
    const food = d.meals ? `${formatAmount(d.amount)} ${unitText(d.amount)} over ${d.meals === 1 ? "1 meal" : `${d.meals} meals`}` : "no meals with an amount";
    return `${food}; ${d.weight === null ? "no weigh-in" : `weighed ${d.weight} ${weightUnit}`}`;
  };

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-manipulation select-none" role="img" aria-label={`Meal amount and weight by day, last ${days.length} days`}>
        {[wLo, wHi].map((v, k) => (
          <g key={k}>
            <line x1={PAD.left} x2={W - PAD.right} y1={wy(v)} y2={wy(v)} stroke="rgb(var(--line-rgb))" strokeOpacity={0.45} />
            <text x={PAD.left - 4} y={wy(v) + 4} fontSize={10} textAnchor="end" fill="rgb(var(--ink-soft-rgb))">
              {ws.length ? Math.round(v * 10) / 10 : ""}
            </text>
          </g>
        ))}
        {[0, fMax / 2, fMax].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={fy(v)} y2={fy(v)} stroke="rgb(var(--line-rgb))" strokeOpacity={0.45} />
            <text x={PAD.left - 4} y={fy(v) + 4} fontSize={10} textAnchor="end" fill="rgb(var(--ink-soft-rgb))">
              {formatAmount(v)}
            </text>
          </g>
        ))}
        {ws.length === 0 && (
          <text x={PAD.left + 6} y={PAD.top + WH / 2 + 4} fontSize={11} fill="rgb(var(--ink-soft-rgb))">
            No weigh-ins in these days
          </text>
        )}
        {days.map((d, i) => (
          <g key={d.start.getTime()} onClick={() => setActive(active === i ? null : i)} className="cursor-pointer">
            <rect
              x={PAD.left + i * bw}
              y={PAD.top}
              width={bw}
              height={WH + GAP + FH}
              fill={active === i ? "rgb(var(--surface-raised-rgb))" : "transparent"}
              rx={2}
            />
            {d.amount > 0 && (
              <rect x={PAD.left + i * bw + 3} width={bw - 6} y={fy(d.amount)} height={fy0 - fy(d.amount)} fill="var(--lando-series-2)" rx={1.5} />
            )}
            {(i % 3 === 1 || i === last) && (
              <text x={cx(i)} y={H - 5} fontSize={10} textAnchor="middle" fill="rgb(var(--ink-soft-rgb))">
                {i === last ? "today" : day(i)}
              </text>
            )}
          </g>
        ))}
        {path && <path d={path} fill="none" stroke="rgb(var(--accent-rgb))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {days.map((d, i) =>
          d.weight === null ? null : (
            <circle key={d.start.getTime()} cx={cx(i)} cy={wy(d.weight)} r={active === i ? 5 : 3.5} fill="rgb(var(--accent-rgb))" stroke="rgb(var(--surface-rgb))" strokeWidth={1.5} pointerEvents="none" />
          )
        )}
      </svg>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[13px] text-ink-soft">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden="true" className="block">
            <circle cx={5} cy={5} r={4.4} fill="rgb(var(--accent-rgb))" />
          </svg>
          Weight ({weightUnit}), top
        </span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden="true" className="block">
            <rect x={1.5} y={0.5} width={7} height={9} rx={1.5} fill="var(--lando-series-2)" />
          </svg>
          Meals ({data.hasAmounts ? (unit ? `${unit}s` : "servings") : "no amounts"}), bottom
        </span>
      </div>
      <p className="min-h-[1.25rem] text-[13px] tabular-nums text-ink-soft" aria-live="polite">
        {active === null ? "Tap a day for its numbers." : `${active === last ? "Today" : day(active)}: ${say(active)}`}
      </p>
      {(data.otherUnit > 0 || data.noAmount > 0) && (
        <p className="text-[13px] text-ink-soft">
          {data.otherUnit > 0 && `${data.otherUnit} ${data.otherUnit === 1 ? "meal" : "meals"} in another unit left out. `}
          {data.noAmount > 0 && `${data.noAmount} ${data.noAmount === 1 ? "meal" : "meals"} with no amount left out.`}
        </p>
      )}
    </div>
  );
}

/** The next round number at or above n: 1, 2, 2.5, 5 or 10 times a power of ten. */
function niceCeil(n: number): number {
  const p = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 4, 5, 10]) if (m * p >= n) return m * p;
  return 10 * p;
}
