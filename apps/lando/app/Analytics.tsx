"use client";

import { useMemo } from "react";
import {
  ANALYTICS_DAYS,
  EXERCISE_WEEKS,
  MEAL_POOP_WINDOW_MS,
  about,
  accidentTrend,
  dailyAverage,
  dayMarks,
  dayStarts,
  foodAgainstWeight,
  formatSpan,
  mealToPoop,
  peeGaps,
  perDay,
  typicalGaps,
  weeklyExercise,
} from "@/lib/analytics";
import { displayUnit, type JournalEvent } from "@/lib/events";
import DailyChart, { type DailyColumn } from "./DailyChart";
import DayTimeline from "./DayTimeline";
import FoodWeightChart from "./FoodWeight";
import GrowthChart from "./GrowthChart";

const MIN = 60_000;
const spanMin = (min: number) => formatSpan(min * MIN);
const dayName = (d: Date) => d.toLocaleDateString([], { weekday: "short", month: "numeric", day: "numeric" });

function Card({ title, summary, children }: { title: string; summary?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid min-w-0 gap-1.5 rounded-[14px] border border-line bg-surface p-3">
      <h3 className="text-base font-bold">{title}</h3>
      {summary && <div className="text-sm tabular-nums text-ink-soft">{summary}</div>}
      {children}
    </section>
  );
}

/**
 * The last fourteen of the phone's days, from the same read as the Log tab
 * (TEC-143): a timeline of potty and food by the hour, the gaps between pees,
 * meal to poop, food against weight, the growth chart, and exercise by week.
 * Calories are recorded with every food and deliberately not shown. No model
 * is called here (RULES, Never 4).
 */
export default function Analytics({ events, now }: { events: JournalEvent[]; now: Date }) {
  // Re-bucketed when the day changes, not on every clock tick; meal to poop
  // needs the real clock (a meal an hour ago may still get its poop), so it
  // moves by the minute.
  const dayKey = now.toDateString();
  const minute = Math.floor(now.getTime() / MIN);
  const midnight = useMemo(() => new Date(dayKey), [dayKey]);
  const rows = useMemo(() => perDay(events, midnight), [events, midnight]);
  const marks = useMemo(() => dayMarks(events, midnight), [events, midnight]);
  const gaps = useMemo(() => peeGaps(events, midnight), [events, midnight]);
  const mealPoop = useMemo(() => mealToPoop(events, new Date(minute * MIN)), [events, minute]);
  const unit = displayUnit(events);
  const foodWeight = useMemo(() => foodAgainstWeight(events, midnight, unit), [events, midnight, unit]);
  const weeks = useMemo(() => weeklyExercise(events, midnight), [events, midnight]);
  const since = dayStarts(midnight)[0];

  const outside = dailyAverage(rows, ["pee", "poop"]);
  const tooSoon = "Not a full day logged yet, so no average.";
  const typical = typicalGaps(gaps);

  const gapCols: DailyColumn[] = gaps.map((g) => ({
    start: g.start,
    bar: g.longest === null ? null : g.longest / MIN,
    dot: g.average === null ? null : g.average / MIN,
    text:
      `${g.gaps.length ? `average ${formatSpan(g.average!)}, longest ${formatSpan(g.longest!)} over ${g.gaps.length} ${g.gaps.length === 1 ? "gap" : "gaps"}` : g.pees === 0 ? "no pees" : "fewer than two pees, no gap"}` +
      `${g.overnight === null ? "" : `; overnight ${formatSpan(g.overnight)}`}`,
  }));
  const mealCols: DailyColumn[] = mealPoop.days.map((d) => ({
    start: d.start,
    dot: d.median,
    extra: d.minutes,
    text: d.minutes.length
      ? `${d.minutes.map(spanMin).join(", ")} to the next poop${d.minutes.length > 1 ? `, median ${spanMin(d.median!)}` : ""}${d.none ? `; ${d.none} with no poop in ${MEAL_POOP_WINDOW_MS / 3_600_000}h` : ""}`
      : d.none
        ? `${d.none} ${d.none === 1 ? "meal" : "meals"} with no poop in ${MEAL_POOP_WINDOW_MS / 3_600_000}h`
        : "no meals counted",
  }));

  const weekMax = Math.max(1, ...weeks.map((w) => w.fun + w.training));
  const week = (i: number) =>
    i === weeks.length - 1
      ? "Last 7 days"
      : `${weeks[i].start.toLocaleDateString([], { month: "short", day: "numeric" })} – ${weeks[i].end.toLocaleDateString([], { month: "short", day: "numeric" })}`;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">Last {ANALYTICS_DAYS} days</h2>

      <Card
        title="Day by day"
        summary={`${outside === null ? tooSoon : `About ${about(outside)} trips outside a day.`} ${accidentTrend(rows)}`}
      >
        <DayTimeline days={marks} rows={rows} />
      </Card>

      <Card
        title="Time between pees"
        summary={
          typical.daytime === null ? (
            "Not enough pees on one day to measure a gap."
          ) : (
            <>
              Typically {formatSpan(typical.daytime)} apart in the day. Longest {formatSpan(typical.longest!.ms)}, on{" "}
              {dayName(typical.longest!.start)}.
              {typical.overnight !== null && <> Overnight, typically {formatSpan(typical.overnight)}.</>}
            </>
          )
        }
      >
        <DailyChart
          cols={gapCols}
          label="Time between pees"
          legend={[
            { shape: "bar", label: "Longest gap" },
            { shape: "dot", label: "Average gap" },
          ]}
        />
        <p className="text-[13px] text-ink-soft">
          A gap is counted on the day it ends. The gap across midnight is the overnight one: shown on its own, left out of the average and the longest.
        </p>
      </Card>

      <Card
        title="Meal to poop"
        summary={
          mealPoop.median === null ? (
            "No meal with a poop inside 6 hours yet."
          ) : (
            <>
              Typically {spanMin(mealPoop.median)} from a meal to the next poop (the middle of {mealPoop.matched}{" "}
              {mealPoop.matched === 1 ? "meal" : "meals"}).
            </>
          )
        }
      >
        <DailyChart
          cols={mealCols}
          label="Minutes from each meal to the next poop"
          legend={[
            { shape: "diamond", label: "Each meal" },
            { shape: "dot", label: "Day's middle" },
          ]}
        />
        <p className="text-[13px] text-ink-soft">
          Only a poop within {MEAL_POOP_WINDOW_MS / 3_600_000} hours counts.
          {mealPoop.none > 0 && ` ${mealPoop.none} ${mealPoop.none === 1 ? "meal" : "meals"} had none and ${mealPoop.none === 1 ? "is" : "are"} left out.`}
          {mealPoop.pending > 0 && ` ${mealPoop.pending} too recent to tell.`}
        </p>
      </Card>

      <Card
        title="Food and weight"
        summary={
          foodWeight.hasAmounts
            ? `Meal amount each day${foodWeight.unit ? `, in ${foodWeight.unit}s` : ""}, under his weight on the same days.`
            : "No meal with an amount in these days."
        }
      >
        <FoodWeightChart data={foodWeight} />
      </Card>

      <Card title="Weight">
        <GrowthChart events={events} since={since} />
      </Card>

      <Card
        title="Exercise per week"
        summary={`Minutes in each run of 7 days, the last ${EXERCISE_WEEKS} weeks at most. Fun is walks and playtime.`}
      >
        <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[13px] text-ink-soft">
          <span className="whitespace-nowrap">
            <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] align-[-1px]" style={{ background: "var(--lando-series-1)" }} />
            Fun
          </span>
          <span className="whitespace-nowrap">
            <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] align-[-1px]" style={{ background: "var(--lando-series-3)" }} />
            Training
          </span>
        </div>
        <ul className="grid gap-2">
          {[...weeks.keys()].reverse().map((i) => {
            const w = weeks[i];
            return (
              <li key={w.start.getTime()} className="grid gap-1">
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="text-ink-soft">{week(i)}</span>
                  <span className="tabular-nums">
                    {w.fun + w.training} min <span className="text-ink-soft">· Fun {w.fun}, Training {w.training}</span>
                  </span>
                </div>
                <div
                  className="flex h-3 gap-px"
                  style={{ width: `${((w.fun + w.training) / weekMax) * 100}%`, minWidth: w.fun + w.training ? 4 : 0 }}
                  role="img"
                  aria-label={`${week(i)}: ${w.fun} minutes fun, ${w.training} minutes training`}
                >
                  {w.fun > 0 && <span className="rounded-[3px]" style={{ flex: w.fun, background: "var(--lando-series-1)" }} />}
                  {w.training > 0 && <span className="rounded-[3px]" style={{ flex: w.training, background: "var(--lando-series-3)" }} />}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <p className="text-[13px] text-ink-soft">
        Averages count full days from the first one logged. Calories are recorded for every food but not shown yet.
      </p>
    </div>
  );
}
