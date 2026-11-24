"use client";

import { shortDay } from "@/lib/days";
import type { Chore, Completion, Person, WeekData } from "@/lib/types";
import { uuid } from "@/lib/uuid";
import { choresForDay, eventsForDay, whenLabel, type DueChore } from "@/lib/week";
import type { Send } from "./outbox";
import type { Pending } from "./Week";

/** The tick a person has on this chore for this day, if one stands. */
function tickBy(chore: Chore, day: string, person: Person, completions: Completion[]): Completion | undefined {
  return completions.find((c) => c.chore_id === chore.id && c.person_id === person.id && (chore.cadence === "once" || c.day === day));
}

function ChoreRow({
  due,
  day,
  today,
  week,
  pending,
  setPending,
  send,
}: {
  due: DueChore;
  day: string;
  today: string;
  week: WeekData;
  pending: Pending;
  setPending: (fn: (p: Pending) => Pending) => void;
  send: Send;
}) {
  const { chore } = due;
  const active = week.people.filter((p) => p.active);
  const byId = new Map(week.people.map((p) => [p.id, p]));
  const assignee = chore.assignee_id ? byId.get(chore.assignee_id) : undefined;
  // A tick belongs to the day it is for: an overdue once-only chore is ticked on today.
  const tickDay = due.overdue ? today : day;
  const future = tickDay > today;
  const key = (p: Person) => `${chore.id}|${p.id}|${tickDay}`;
  const done = due.ticks.length > 0;
  // Someone who has since left may still have done it: shown, not tappable.
  const gone = due.ticks.map((t) => byId.get(t.person_id)).filter((p): p is Person => !!p && !p.active);

  async function tap(person: Person) {
    // A tap while the last one for this name is still on its way is ignored, so one finger cannot tick and void in a blink.
    if (pending[key(person)] !== undefined) return;
    const live = tickBy(chore, tickDay, person, week.completions);
    setPending((p) => ({ ...p, [key(person)]: !live }));
    if (live) await send(`Undo: ${chore.title}`, "/api/completions", { op: "void", id: uuid(), completion_id: live.id });
    else await send(`Tick: ${chore.title}`, "/api/completions", { op: "done", id: uuid(), chore_id: chore.id, day: tickDay, person_id: person.id });
    setPending((p) => {
      const next = { ...p };
      delete next[key(person)];
      return next;
    });
  }

  return (
    <li className="border-b border-line/40 py-3 last:border-0">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className={`text-base font-medium ${done ? "text-ink/50 line-through" : ""}`}>{chore.title}</span>
        {due.overdue && <span className="rounded bg-urgent/15 px-1.5 text-xs font-semibold text-urgent">Overdue</span>}
        {assignee && <span className="text-xs text-ink/60">for {assignee.name}</span>}
      </div>
      {active.length === 0 ? (
        <p className="mt-1 text-sm text-ink/60">Add people under Chores and people to tick this off.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`Who did ${chore.title}`}>
          {active.map((p) => {
            const mine = !!tickBy(chore, tickDay, p, week.completions);
            const waiting = pending[key(p)] !== undefined;
            const shown = pending[key(p)] ?? mine;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={shown}
                disabled={future}
                onClick={() => void tap(p)}
                className={`min-h-14 min-w-14 rounded-xl border-2 px-4 text-base font-medium disabled:opacity-40 ${shown ? "border-accent bg-accent text-accent-ink" : "border-line bg-paper"} ${waiting ? "opacity-60" : ""}`}
              >
                {shown ? "✓ " : ""}
                {p.name}
              </button>
            );
          })}
          {gone.map((p) => (
            <span key={p.id} className="flex min-h-14 items-center px-2 text-sm text-ink/60">
              ✓ {p.name}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

/** One day of the week: a header that opens it in place, then its events beside the chores due. */
export default function DayCard({
  day,
  today,
  week,
  open,
  onToggle,
  pending,
  setPending,
  send,
}: {
  day: string;
  today: string;
  week: WeekData;
  open: boolean;
  onToggle: () => void;
  pending: Pending;
  setPending: (fn: (p: Pending) => Pending) => void;
  send: Send;
}) {
  const isToday = day === today;
  const chores = choresForDay(week.chores, week.completions, day, today);
  const doneCount = chores.filter((c) => c.ticks.length > 0).length;
  const events = week.events.ok ? eventsForDay(week.events.events, day) : [];
  const eventsText = week.events.ok ? `${events.length} ${events.length === 1 ? "event" : "events"}` : "events unavailable";
  const choresText = chores.length === 0 ? "no chores" : `${doneCount} of ${chores.length} done`;

  return (
    <section
      data-today={isToday}
      aria-labelledby={`day-${day}`}
      className={`rounded-2xl border bg-surface ${isToday ? "border-2 border-accent" : "border-line"} ${day < today ? "opacity-90" : ""}`}
    >
      <h2 id={`day-${day}`}>
        <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left">
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-semibold">
              {shortDay(day)}
              {isToday && <span className="ml-2 rounded bg-accent px-1.5 py-0.5 align-middle text-xs font-semibold text-accent-ink">Today</span>}
            </span>
            <span className="block text-sm text-ink/70">
              {eventsText} · {choresText}
            </span>
          </span>
          <span aria-hidden="true" className="text-xl text-ink/60">
            {open ? "▾" : "▸"}
          </span>
        </button>
      </h2>

      {open && (
        <div className="border-t border-line/40 px-4 pb-3">
          <h3 className="pt-3 text-sm font-semibold uppercase tracking-wide text-ink/60">Events</h3>
          {!week.events.ok ? (
            <p className="py-2 text-sm font-medium text-warn">Events unavailable: the calendar could not be read.</p>
          ) : events.length === 0 ? (
            <p className="py-2 text-sm text-ink/60">No events.</p>
          ) : (
            <ul className="py-1">
              {events.map((e, i) => (
                <li key={`${e.calendar}|${e.start}|${e.title}|${i}`} className="flex gap-3 py-1.5">
                  <span className="w-28 shrink-0 text-sm text-ink/70">{whenLabel(e, day)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block">{e.title}</span>
                    <span className="block text-xs text-ink/50">{e.calendar}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="pt-3 text-sm font-semibold uppercase tracking-wide text-ink/60">Chores</h3>
          {chores.length === 0 ? (
            <p className="py-2 text-sm text-ink/60">No chores due.</p>
          ) : (
            <ul>
              {chores.map((due) => (
                <ChoreRow key={due.chore.id} due={due} day={day} today={today} week={week} pending={pending} setPending={setPending} send={send} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
