"use client";

import { useMemo, useRef, useState } from "react";
import { FORM_LABELS, HEALTH_LABELS, feedTone, isAccident, type FormKind, type HealthType, type JournalEvent } from "@/lib/events";
import { clockTime } from "@/lib/localtime";
import {
  calendarDays,
  canPlanOn,
  dayDots,
  dayHeading,
  dayWords,
  monthGrid,
  monthKey,
  monthLabel,
  monthOf,
  shiftMonth,
  swipeStep,
  type YearMonth,
} from "@/lib/calendar";
import type { Upcoming } from "@/lib/upcoming";
import UpcomingList from "./UpcomingList";

/** What "Add a plan" offers: the forms a plan can come from, Health split into its three. */
const PLAN_CHOICES: { label: string; form: FormKind; healthType?: HealthType }[] = [
  { label: HEALTH_LABELS.vet, form: "health", healthType: "vet" },
  { label: HEALTH_LABELS.medication, form: "health", healthType: "medication" },
  { label: HEALTH_LABELS.issue, form: "health", healthType: "issue" },
  { label: FORM_LABELS.training, form: "training" },
  { label: FORM_LABELS.food, form: "food" },
  { label: FORM_LABELS.fun, form: "fun" },
  { label: FORM_LABELS.potty, form: "potty" },
  { label: FORM_LABELS.weight, form: "weight" },
];

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The Calendar tab (TEC-234): a month you can step through with the arrows or swipe, today marked, and under
 * each day small dots, a filled dot for each kind of entry logged and a ring for each kind of plan due, in the
 * feed's colours. Tapping a day lists its plans (Done and edit, the Log's `UpcomingList`) and its entries (a tap
 * opens one as in the Log). On today and later days, "Add a plan" asks which form and opens it on that day.
 * It reads what the Log already holds; notes are not in `entries`. A local pattern: the month grid and the dots.
 */
export default function Calendar({
  entries,
  upcoming,
  upcomingError,
  loaded,
  today,
  describeEntry,
  nameOf,
  onDone,
  onEditPlan,
  onOpenEntry,
  onAddPlan,
}: {
  entries: readonly JournalEvent[];
  upcoming: Upcoming[] | null;
  upcomingError: string | null;
  loaded: boolean;
  today: string;
  describeEntry: (e: JournalEvent) => { title: string; detail: string };
  nameOf: (id: string | null) => string | null;
  onDone: (item: Upcoming) => Promise<{ error: string | null } | void>;
  onEditPlan: (item: Upcoming) => void;
  onOpenEntry: (e: JournalEvent) => void;
  onAddPlan: (day: string, form: FormKind, healthType?: HealthType) => void;
}) {
  const [month, setMonth] = useState<YearMonth>(() => monthOf(today));
  const [picked, setPicked] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const days = useMemo(() => calendarDays(entries, upcoming ?? []), [entries, upcoming]);
  const weeks = useMemo(() => monthGrid(month), [month]);
  const selected = picked ?? today;
  const bucket = days.get(selected);
  const thisMonth = monthKey(month) === monthKey(monthOf(today));

  function step(delta: number) {
    setMonth((m) => shiftMonth(m, delta));
    setChoosing(false);
  }
  function pick(day: string) {
    setPicked(day);
    setChoosing(false);
    // A tap on a grey day of the next or last month goes there.
    if (monthKey(monthOf(day)) !== monthKey(month)) setMonth(monthOf(day));
  }
  function goToday() {
    setMonth(monthOf(today));
    setPicked(today);
    setChoosing(false);
  }

  return (
    <section aria-label="Calendar" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => step(-1)} aria-label="Previous month" className="min-h-[44px] min-w-[44px] rounded-[10px] border border-line text-lg font-bold">
          ‹
        </button>
        <h2 aria-live="polite" className="flex-1 text-center text-base font-bold">
          {monthLabel(month)}
        </h2>
        {!thisMonth && (
          <button type="button" onClick={goToday} className="min-h-[44px] rounded-[10px] border border-line px-2.5 text-sm font-semibold">
            Today
          </button>
        )}
        <button type="button" onClick={() => step(1)} aria-label="Next month" className="min-h-[44px] min-w-[44px] rounded-[10px] border border-line text-lg font-bold">
          ›
        </button>
      </div>

      {/* The grid. A sideways swipe steps a month; a mostly vertical drag is the page scrolling. */}
      <div
        role="grid"
        aria-label={monthLabel(month)}
        className="touch-pan-y select-none"
        onTouchStart={(e) => {
          const t = e.touches[0];
          touch.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const start = touch.current;
          touch.current = null;
          if (!start) return;
          const t = e.changedTouches[0];
          const go = swipeStep(t.clientX - start.x, t.clientY - start.y);
          if (go) step(go);
        }}
      >
        <div role="row" className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase text-ink-soft">
          {WEEKDAYS.map((w, i) => (
            <div key={i} role="columnheader" aria-label={WEEKDAY_NAMES[i]} className="py-1">
              {w}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} role="row" className="grid grid-cols-7">
            {week.map((c) => {
              const dots = dayDots(days.get(c.day));
              const isToday = c.day === today;
              const isSelected = c.day === selected;
              return (
                <div key={c.day} role="gridcell" className="p-0.5">
                  <button
                    type="button"
                    onClick={() => pick(c.day)}
                    aria-label={dayWords(c.day, days.get(c.day))}
                    aria-pressed={isSelected}
                    aria-current={isToday ? "date" : undefined}
                    className={`flex min-h-[52px] w-full flex-col items-center justify-start gap-0.5 rounded-xl border pt-1 ${
                      isSelected ? "border-ink bg-surface" : "border-transparent"
                    } ${c.inMonth ? "" : "opacity-45"}`}
                  >
                    <span
                      className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-[14px] tabular-nums ${
                        isToday ? "bg-accent font-bold text-accent-ink" : "font-semibold"
                      }`}
                    >
                      {c.date}
                    </span>
                    {/* Filled dots are entries, rings are plans; colour is the feed's, and the day's list names each. */}
                    <span aria-hidden="true" className="flex h-2 items-center justify-center gap-[3px] text-ink-soft">
                      {dots.entries.map((t) => (
                        <i key={`e-${t}`} data-kind={t} className="lando-cal-dot" />
                      ))}
                      {dots.plans.map((t, i) => (
                        <i key={`p-${t ?? i}`} data-kind={t ?? undefined} className="lando-cal-plan" />
                      ))}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <p aria-hidden="true" className="flex items-center justify-center gap-4 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5">
          <i data-kind="health" className="lando-cal-dot" /> Logged
        </span>
        <span className="flex items-center gap-1.5">
          <i data-kind="health" className="lando-cal-plan" /> Planned
        </span>
      </p>

      <section aria-label={dayHeading(selected, today)} className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[15px] font-bold">{dayHeading(selected, today)}</h3>
          {canPlanOn(selected, today) && !choosing && (
            <button
              type="button"
              onClick={() => setChoosing(true)}
              className="min-h-[44px] rounded-[10px] bg-accent px-3 font-semibold text-accent-ink"
            >
              Add a plan
            </button>
          )}
        </div>

        {choosing && (
          <div role="group" aria-label="Plan what?" className="flex flex-wrap gap-1.5">
            {PLAN_CHOICES.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => {
                  setChoosing(false);
                  onAddPlan(selected, c.form, c.healthType);
                }}
                className="min-h-[44px] rounded-full border border-line px-3 text-sm font-semibold"
              >
                {c.label}
              </button>
            ))}
            <button type="button" onClick={() => setChoosing(false)} className="min-h-[44px] px-2 text-sm text-ink-soft">
              Cancel
            </button>
          </div>
        )}

        {upcomingError && !upcoming && <p className="text-urgent">Couldn&apos;t load plans. ({upcomingError})</p>}
        {!loaded && <p className="text-ink-soft">Loading…</p>}

        {bucket && bucket.plans.length > 0 && (
          <div className="flex flex-col gap-1">
            <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">Plans</h4>
            <UpcomingList items={bucket.plans} today={today} onDone={onDone} onEdit={onEditPlan} />
          </div>
        )}

        {bucket && bucket.entries.length > 0 && (
          <div className="flex flex-col gap-1">
            <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">Logged</h4>
            <ul className="flex flex-col gap-1">
              {bucket.entries.map((e) => {
                const { title, detail } = describeEntry(e);
                const accident = isAccident(e);
                const who = nameOf(e.person_id);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      data-kind={feedTone(e) ?? undefined}
                      onClick={() => onOpenEntry(e)}
                      className={`lando-row grid w-full grid-cols-[3.5rem_minmax(0,1fr)_auto] items-baseline gap-2 rounded-xl border bg-surface px-2.5 py-2 text-left ${
                        accident ? "border-danger" : "border-line"
                      }`}
                    >
                      <span className="whitespace-nowrap text-sm tabular-nums text-ink-soft">{e.kind === "weight" ? "" : clockTime(e.at)}</span>
                      <span className="block min-w-0 truncate">
                        <b className={`mr-1.5 ${accident ? "text-danger" : ""}`}>{title}</b>
                        <span className="text-sm text-ink-soft">{detail}</span>
                      </span>
                      <span className="whitespace-nowrap text-[13px] text-ink-soft">{who}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-ink-soft">Tap an entry to correct or delete it.</p>
          </div>
        )}

        {loaded && bucket === undefined && <p className="text-ink-soft">Nothing on this day.</p>}
      </section>
    </section>
  );
}
