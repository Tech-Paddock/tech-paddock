"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CalendarWeekError } from "@/lib/calendar-client";
import { addDays, localDay, weekDays, weekLabel, weekStartOf } from "@/lib/days";
import type { WeekData } from "@/lib/types";
import { timeOf } from "@/lib/week";
import DayCard from "./DayCard";
import Manage from "./Manage";
import { NotSaved, useOutbox } from "./outbox";

/** How often the board reads again, besides on focus: it is left on in the house and never needs a reload. */
export const REFRESH_MS = 60_000;

export const CALENDAR_PROBLEM: Record<CalendarWeekError, string> = {
  not_connected: "Outlook isn't connected, so this week's events can't be shown.",
  microsoft: "Microsoft didn't answer, so this week's events can't be shown.",
  signed_out: "The calendar signed this device out, so this week's events can't be shown. Reload to sign in again.",
  bad_start: "The calendar refused this week, so its events can't be shown.",
  unavailable: "The calendar couldn't be reached, so this week's events can't be shown.",
};

/** What a tap on a name intends, shown dimmed until the server's own read comes back: `chore|person|day` to its intended state. */
export type Pending = Record<string, boolean>;

export default function Week() {
  const [today, setToday] = useState<string | null>(null);
  // Null follows the current week; a number of weeks from it once someone has paged.
  const [offset, setOffset] = useState(0);
  const [week, setWeek] = useState<WeekData | null>(null);
  const [lastRead, setLastRead] = useState<Date | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [managing, setManaging] = useState(false);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Pending>({});
  const offsetRef = useRef(0);
  offsetRef.current = offset;
  const latest = useRef(0);

  const load = useCallback(async () => {
    const now = localDay();
    setToday(now);
    const start = addDays(weekStartOf(now), offsetRef.current * 7);
    const mine = ++latest.current;
    try {
      const res = await fetch(`/api/week?start=${start}`, { cache: "no-store" });
      if (!res.ok) throw new Error("read failed");
      const data = (await res.json()) as WeekData;
      // A read that was overtaken (the week was paged meanwhile) is dropped.
      if (mine !== latest.current) return;
      setWeek(data);
      setLastRead(new Date());
      setReadFailed(false);
    } catch {
      if (mine === latest.current) setReadFailed(true);
    }
  }, []);

  const outbox = useOutbox(load);

  useEffect(() => {
    void load();
  }, [load, offset]);

  useEffect(() => {
    const again = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(again, REFRESH_MS);
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [load]);

  // Opens on today: the first read brings today's card into view, once.
  const scrolled = useRef(false);
  useEffect(() => {
    if (!week || scrolled.current) return;
    scrolled.current = true;
    document.querySelector("[data-today='true']")?.scrollIntoView({ block: "start" });
  }, [week]);

  if (!today) return <p className="p-6 text-ink/70">Loading…</p>;

  const start = week?.start ?? addDays(weekStartOf(today), offset * 7);
  const days = weekDays(start);

  return (
    <div className="mx-auto max-w-screen-2xl px-3 pb-10">
      <NotSaved failed={outbox.failed} retry={outbox.retry} discard={outbox.discard} />

      <div className="flex flex-wrap items-center gap-2 py-3">
        <button type="button" aria-label="Previous week" onClick={() => setOffset(offset - 1)} className="min-h-14 min-w-14 rounded-xl border border-line bg-surface text-xl">
          ‹
        </button>
        <button
          type="button"
          onClick={() => setOffset(0)}
          aria-label={offset === 0 ? "This week" : "Back to this week"}
          className="min-h-14 flex-1 rounded-xl border border-line bg-surface px-4 text-left sm:flex-none sm:text-center"
        >
          <span className="block text-lg font-semibold">{offset === 0 ? "This week" : offset === 1 ? "Next week" : offset === -1 ? "Last week" : "Week of"}</span>
          <span className="block text-sm text-ink/70">{weekLabel(start)}</span>
        </button>
        <button type="button" aria-label="Next week" onClick={() => setOffset(offset + 1)} className="min-h-14 min-w-14 rounded-xl border border-line bg-surface text-xl">
          ›
        </button>
        <span className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-ink/60 sm:inline">{lastRead ? `Updated ${timeOf(lastRead)}` : ""}</span>
          <button
            type="button"
            aria-pressed={managing}
            onClick={() => setManaging(!managing)}
            className={`min-h-14 rounded-xl border px-5 font-medium ${managing ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface"}`}
          >
            Chores and people
          </button>
        </span>
      </div>

      {readFailed && (
        <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border-2 border-urgent bg-surface px-4 py-3">
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold text-urgent">Can't reach Pit Row.</span>{" "}
            {week ? `Showing what was read ${lastRead ? `at ${timeOf(lastRead)}` : "earlier"}; it may be out of date.` : "Nothing has loaded yet."}
          </p>
          <button type="button" onClick={() => void load()} className="min-h-14 rounded-lg bg-accent px-5 font-medium text-accent-ink">
            Try again
          </button>
        </div>
      )}

      {week && !week.events.ok && (
        <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border-2 border-warn bg-surface px-4 py-3">
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">Events unavailable.</span> {CALENDAR_PROBLEM[week.events.error]} The chores below are unaffected.
          </p>
          <button type="button" onClick={() => void load()} className="min-h-14 rounded-lg border border-line px-5 font-medium">
            Try again
          </button>
        </div>
      )}

      {managing && week && <Manage week={week} today={today} send={outbox.send} />}

      {!week ? (
        !readFailed && <p className="p-6 text-ink/70">Loading…</p>
      ) : (
        <div className="grid items-start gap-3 md:grid-cols-2 lg:grid-cols-3">
          {days.map((day) => (
            <DayCard
              key={day}
              day={day}
              today={today}
              week={week}
              open={opened[day] ?? day === today}
              onToggle={() => setOpened({ ...opened, [day]: !(opened[day] ?? day === today) })}
              pending={pending}
              setPending={setPending}
              send={outbox.send}
            />
          ))}
        </div>
      )}
    </div>
  );
}
