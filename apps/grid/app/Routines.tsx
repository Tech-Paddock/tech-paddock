"use client";

import { useState } from "react";
import { ALL_WEEKDAYS, WEEKDAY_LETTERS, WEEKDAY_NAMES } from "@/lib/days";
import type { Routine } from "@/lib/types";
import { uuid } from "@/lib/uuid";
import type { Send } from "./outbox";

function RoutineRow({ routine, day, send }: { routine: Routine; day: string; send: Send }) {
  const [want, setWant] = useState<boolean | null>(null);
  const shown = want ?? routine.ticked;

  async function toggle() {
    setWant(!shown);
    await send(`${shown ? "Untick" : "Tick"} routine: ${routine.name}`, "/api/routines", {
      op: "tick",
      routine_id: routine.id,
      day,
      ticked: !shown,
    });
    setWant(null);
  }

  return (
    <li className="border-b border-line/40 last:border-0">
      <button type="button" role="checkbox" aria-checked={shown} onClick={toggle} className="flex min-h-11 w-full items-center gap-1 text-left">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${shown ? "border-accent bg-accent text-accent-ink" : "border-line"} ${want != null ? "opacity-60" : ""}`}
            aria-hidden="true"
          >
            {shown ? "✓" : ""}
          </span>
        </span>
        <span className={`py-2 ${shown ? "text-ink/50" : ""}`}>{routine.name}</span>
      </button>
    </li>
  );
}

/** The weekday picker, shared with the second page's routine form. */
export function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div role="group" aria-label="Repeats on" className="flex gap-1">
      {ALL_WEEKDAYS.map((d) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            aria-label={WEEKDAY_NAMES[d]}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort())}
            className={`h-11 min-w-0 flex-1 rounded-lg border text-sm font-medium ${on ? "border-accent bg-accent text-accent-ink" : "border-line bg-paper"}`}
          >
            {WEEKDAY_LETTERS[d]}
          </button>
        );
      })}
    </div>
  );
}

export function AddRoutine({ send }: { send: Send }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [days, setDays] = useState<number[]>(ALL_WEEKDAYS);

  function add(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || days.length === 0) return;
    void send(`Add routine: ${n}`, "/api/routines", { op: "add", id: uuid(), name: n, weekdays: days });
    setName("");
    setDays(ALL_WEEKDAYS);
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 min-h-11 text-sm text-ink/70 underline">
        Add a routine
      </button>
    );
  }
  return (
    <form onSubmit={add} className="mt-2 flex flex-col gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={100}
        placeholder="Routine name"
        aria-label="Routine name"
        autoFocus
        className="min-h-11 rounded-lg border border-line bg-paper px-3 outline-none focus:border-accent"
      />
      <WeekdayPicker value={days} onChange={setDays} />
      <div className="flex gap-2">
        <button type="submit" disabled={!name.trim() || days.length === 0} className="min-h-11 rounded-lg bg-accent px-4 font-medium text-accent-ink disabled:opacity-50">
          Save routine
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3 text-ink/70 underline">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function Routines({ routines, day, send }: { routines: Routine[]; day: string; send: Send }) {
  const done = routines.filter((r) => r.ticked).length;
  return (
    <section aria-labelledby="routines-h" className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h2 id="routines-h" className="text-lg font-semibold">
          Routines
        </h2>
        {routines.length > 0 && (
          <span className="text-sm text-ink/70">
            {done} of {routines.length}
          </span>
        )}
      </div>
      {routines.length === 0 ? (
        <p className="mt-2 text-sm text-ink/70">No routines today.</p>
      ) : (
        <ul className="mt-2">
          {routines.map((r) => (
            <RoutineRow key={r.id} routine={r} day={day} send={send} />
          ))}
        </ul>
      )}
      <AddRoutine send={send} />
    </section>
  );
}
