"use client";

import { useState } from "react";
import {
  MARK_KINDS,
  MARK_LABELS,
  markLane,
  nearestMark,
  stackLevels,
  type DayMarks,
  type DayRow,
  type Mark,
} from "@/lib/analytics";
import { clockTime } from "@/lib/localtime";
import Glyph from "./Glyph";

/**
 * The day timeline (TEC-143): a row per local day, newest first, with the hours
 * 0 to 24 across. A mark sits at the time of each pee, poop, accident, meal and
 * treat; potty marks ride the top lane, food marks the bottom one, so the two
 * never fight for a spot. A local pattern: HTML rows with absolutely placed
 * inline-SVG marks (not one scaled SVG), so the shapes keep their size and the
 * text stays real text at 360px. Marks closer than about an hour in one lane
 * step aside (`stackLevels`) rather than overlap.
 *
 * A row is one button: tap it for the day's numbers and every time, tap near a
 * mark for that entry. The words under the row say what the picture shows, so
 * the chart is never the only way to read a value.
 */
const PAD = 6; // px inside the plot before hour 0 and after hour 24
const LANE = 22; // px per lane
const MARK = 10; // px
const OFFSET = [0, 5, -5]; // px from a lane's middle per stack level
const GAP_HOURS = 0.9; // marks closer than this in one lane step aside at about 9px an hour
const TAP_PX = 16; // how far from a mark still counts as tapping it
const TICKS = [0, 6, 12, 18, 24];

const left = (hour: number) => `calc(${PAD}px + (100% - ${2 * PAD}px) * ${hour / 24})`;
const tick = (h: number) => (h === 0 || h === 24 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`);
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const timeOf = (m: Mark) => clockTime(new Date(m.at).toISOString());
const nameOf = (m: Mark) => (m.kind === "accident" ? `Accident (${m.what})` : MARK_LABELS[m.kind]);

function daySummary(r: DayRow): string {
  const potty = [
    r.pee ? count(r.pee, "pee") : "",
    r.poop ? count(r.poop, "poop") : "",
    r.accident ? count(r.accident, "accident") : "",
  ].filter(Boolean);
  const food = [r.meal ? count(r.meal, "meal") : "", r.treat ? count(r.treat, "treat") : ""].filter(Boolean);
  return `${potty.join(", ") || "No potty"}; ${food.join(", ") || "no food"}`;
}

export default function DayTimeline({ days, rows }: { days: DayMarks[]; rows: DayRow[] }) {
  const [active, setActive] = useState<{ i: number; mark: Mark | null } | null>(null);
  const order = days.map((_, i) => days.length - 1 - i); // newest first
  const isToday = (i: number) => i === days.length - 1;
  const label = (i: number) =>
    isToday(i) ? "Today" : days[i].start.toLocaleDateString([], { weekday: "short", day: "numeric" });
  const long = (i: number) =>
    isToday(i) ? "Today" : days[i].start.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });

  function pick(i: number, e: React.MouseEvent<HTMLButtonElement>) {
    let mark: Mark | null = null;
    const plot = e.currentTarget.querySelector<HTMLElement>("[data-plot]");
    // A keyboard "click" has no position (detail 0): it selects the day.
    if (plot && e.detail > 0) {
      const r = plot.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right) {
        const perPx = 24 / Math.max(1, r.width - 2 * PAD);
        const hour = (e.clientX - r.left - PAD) * perPx;
        const lane = e.clientY < r.top + r.height / 2 ? "potty" : "food";
        const marks = days[i].marks;
        mark =
          nearestMark(marks.filter((m) => markLane(m.kind) === lane), hour, TAP_PX * perPx) ??
          nearestMark(marks, hour, TAP_PX * perPx);
      }
    }
    setActive(active && active.i === i && !mark ? null : { i, mark });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[13px] text-ink-soft">
        {MARK_KINDS.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Glyph kind={k} />
            {MARK_LABELS[k]}
          </span>
        ))}
      </div>
      <p className="text-[13px] text-ink-soft">Potty on the top line, food below. At the end of a row: potty trips, then meals and treats.</p>
      <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_2.2rem] gap-1.5 text-[11px] leading-none text-ink-soft" aria-hidden="true">
        <span />
        <span className="relative h-3">
          {TICKS.map((h) => (
            <span
              key={h}
              className="absolute top-0"
              style={{ left: left(h), transform: `translateX(${h === 0 ? "-6px" : h === 24 ? "calc(-100% + 6px)" : "-50%"})` }}
            >
              {tick(h)}
            </span>
          ))}
        </span>
        <span />
      </div>
      <div className="flex flex-col">
        {order.map((i) => {
          const d = days[i];
          const r = rows[i];
          const on = active?.i === i;
          const potty = r.pee + r.poop + r.accident;
          const foodN = r.meal + r.treat;
          const lanes = (["potty", "food"] as const).map((lane) => {
            const ms = d.marks.filter((m) => markLane(m.kind) === lane);
            const lv = stackLevels(
              ms.map((m) => m.hour),
              GAP_HOURS
            );
            return ms.map((m, j) => ({ m, lane, level: lv[j] }));
          });
          return (
            <div key={d.start.getTime()} className="border-t border-line/40 first:border-t-0">
              <button
                type="button"
                onClick={(e) => pick(i, e)}
                aria-pressed={on}
                aria-label={`${long(i)}: ${daySummary(r)}`}
                className={`grid min-h-[44px] w-full grid-cols-[3.5rem_minmax(0,1fr)_2.2rem] items-stretch gap-1.5 rounded-lg text-left ${
                  on ? "bg-raised" : ""
                }`}
              >
                <span className="self-center whitespace-nowrap pl-1 text-xs tabular-nums text-ink-soft">{label(i)}</span>
                <span data-plot className="relative block h-11">
                  {[6, 12, 18].map((h) => (
                    <span key={h} className="absolute inset-y-1 w-px bg-line/40" style={{ left: left(h) }} />
                  ))}
                  <span className="absolute inset-x-0 top-1/2 h-px bg-line/30" />
                  {lanes.flat().map(({ m, lane, level }) => (
                    <span
                      key={`${m.kind}-${m.at}`}
                      className="absolute"
                      style={{
                        left: left(m.hour),
                        top: (lane === "potty" ? 0 : LANE) + LANE / 2 + OFFSET[level] - MARK / 2,
                        transform: "translateX(-50%)",
                      }}
                    >
                      <Glyph kind={m.kind} size={MARK} ring={active?.i === i && active.mark === m} />
                    </span>
                  ))}
                </span>
                <span className="flex flex-col text-xs tabular-nums" aria-hidden="true">
                  <span className="flex h-[22px] items-center justify-end gap-1">
                    {r.accident > 0 && <Glyph kind="accident" size={9} />}
                    {potty}
                  </span>
                  <span className="flex h-[22px] items-center justify-end">{foodN}</span>
                </span>
              </button>
              {on && active && (
                <div role="status" className="mx-1 mb-2 grid gap-0.5 rounded-lg bg-raised px-2.5 py-2 text-[13px] tabular-nums">
                  {active.mark && (
                    <p className="font-semibold">
                      {nameOf(active.mark)} at {timeOf(active.mark)}
                    </p>
                  )}
                  <p>
                    {long(i)}: {daySummary(r)}.
                  </p>
                  {d.marks.length > 0 && (
                    <p className="text-ink-soft">{d.marks.map((m) => `${timeOf(m)} ${nameOf(m).toLowerCase()}`).join(" · ")}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="min-h-[1.25rem] text-[13px] text-ink-soft" aria-hidden={active ? "true" : undefined}>
        {active ? "" : "Tap a row for its numbers, or a mark for its time."}
      </p>
    </div>
  );
}
