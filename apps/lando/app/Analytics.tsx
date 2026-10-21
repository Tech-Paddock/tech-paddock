"use client";

import { useMemo } from "react";
import { ANALYTICS_DAYS, about, accidentTrend, dailyAverage, dayStarts, perDay } from "@/lib/analytics";
import type { JournalEvent } from "@/lib/events";
import GrowthChart from "./GrowthChart";
import StackedBars, { type Series } from "./StackedBars";

const S1 = "var(--lando-series-1)";
const S2 = "var(--lando-series-2)";
const S3 = "var(--lando-series-3)";
const DANGER = "rgb(var(--danger-rgb))";

const POTTY: Series[] = [
  { key: "pee", label: "Pee", color: S1 },
  { key: "poop", label: "Poop", color: S3 },
  { key: "accident", label: "Accidents", color: DANGER },
];
const FOOD: Series[] = [
  { key: "meal", label: "Meals", color: S1 },
  { key: "treat", label: "Treats", color: S2 },
];
const EXERCISE: Series[] = [
  { key: "walk", label: "Walks", color: S1 },
  { key: "playtime", label: "Playtime", color: S2 },
  { key: "training", label: "Training", color: S3 },
];

function Card({ title, summary, children }: { title: string; summary?: string; children: React.ReactNode }) {
  return (
    <section className="grid min-w-0 gap-1.5 rounded-[14px] border border-line bg-surface p-3">
      <h3 className="text-base font-bold">{title}</h3>
      {summary && <p className="text-sm tabular-nums text-ink-soft">{summary}</p>}
      {children}
    </section>
  );
}

/**
 * The last fourteen of the phone's days, from the same read as the Log tab.
 * Calories are recorded with every food and deliberately not shown.
 */
export default function Analytics({ events, now }: { events: JournalEvent[]; now: Date }) {
  // Re-bucketed when the day changes, not on every clock tick.
  const dayKey = now.toDateString();
  const rows = useMemo(() => perDay(events, new Date(dayKey)), [events, dayKey]);
  const since = dayStarts(new Date(dayKey))[0];

  const outside = dailyAverage(rows, ["pee", "poop"]);
  const meals = dailyAverage(rows, ["meal"]);
  const treats = dailyAverage(rows, ["treat"]);
  const sessions = dailyAverage(rows, ["walk", "playtime", "training"]);
  const minutes = dailyAverage(rows, ["minutes"]);
  const tooSoon = "Not a full day logged yet, so no average.";

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">Last {ANALYTICS_DAYS} days</h2>
      <Card title="Weight">
        <GrowthChart events={events} since={since} />
      </Card>
      <Card
        title="Potty per day"
        summary={`${outside === null ? tooSoon : `About ${about(outside)} trips outside a day.`} ${accidentTrend(rows)}`}
      >
        <StackedBars rows={rows} series={POTTY} label="Potty per day" />
      </Card>
      <Card
        title="Food per day"
        summary={meals === null ? tooSoon : `About ${about(meals)} meals and ${about(treats)} treats a day.`}
      >
        <StackedBars rows={rows} series={FOOD} label="Food per day" />
      </Card>
      <Card
        title="Exercise per day"
        summary={sessions === null ? tooSoon : `About ${about(sessions)} sessions and ${about(minutes)} minutes a day.`}
      >
        <StackedBars rows={rows} series={EXERCISE} label="Exercise per day" />
      </Card>
      <p className="text-[13px] text-ink-soft">
        Averages count full days from the first one logged. Calories are recorded for every food but not shown yet.
      </p>
    </div>
  );
}
