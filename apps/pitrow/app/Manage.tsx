"use client";

import { useState } from "react";
import { ALL_WEEKDAYS, WEEKDAY_LETTERS, WEEKDAY_NAMES } from "@/lib/days";
import type { Cadence, WeekData } from "@/lib/types";
import { uuid } from "@/lib/uuid";
import { cadenceLabel } from "@/lib/week";
import type { Send } from "./outbox";

/** A retire is two taps: the first asks, the second does it. Nothing is deleted; a retired row only stops showing. */
function Retire({ label, onRetire }: { label: string; onRetire: () => void }) {
  const [sure, setSure] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Retire ${label}`}
      onClick={() => (sure ? onRetire() : setSure(true))}
      onBlur={() => setSure(false)}
      className={`min-h-14 rounded-xl border px-4 text-sm font-medium ${sure ? "border-urgent bg-urgent text-white" : "border-line"}`}
    >
      {sure ? "Tap again to retire" : "Retire"}
    </button>
  );
}

const field = "min-h-14 rounded-xl border border-line bg-paper px-3 outline-none focus:border-accent";

function AddPerson({ send }: { send: Send }) {
  const [name, setName] = useState("");
  function add(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    void send(`Add person: ${n}`, "/api/people", { op: "add", id: uuid(), name: n });
    setName("");
  }
  return (
    <form onSubmit={add} className="mt-2 flex gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Name" aria-label="Name" className={`${field} min-w-0 flex-1`} />
      <button type="submit" disabled={!name.trim()} className="min-h-14 rounded-xl bg-accent px-5 font-medium text-accent-ink disabled:opacity-50">
        Add person
      </button>
    </form>
  );
}

const CADENCES: { id: Cadence; label: string }[] = [
  { id: "once", label: "Once" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "every_n", label: "Every N days" },
];

function AddChore({ week, today, send }: { week: WeekData; today: string; send: Send }) {
  const [title, setTitle] = useState("");
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [days, setDays] = useState<number[]>([]);
  const [every, setEvery] = useState("3");
  const [startOn, setStartOn] = useState(today);
  const [assignee, setAssignee] = useState("");
  const n = Number(every);
  const ready =
    title.trim() !== "" &&
    /^\d{4}-\d{2}-\d{2}$/.test(startOn) &&
    (cadence !== "weekly" || days.length > 0) &&
    (cadence !== "every_n" || (Number.isInteger(n) && n >= 2 && n <= 365));

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    void send(`Add chore: ${title.trim()}`, "/api/chores", {
      op: "add",
      id: uuid(),
      title: title.trim(),
      cadence,
      weekdays: cadence === "weekly" ? days : undefined,
      every_n: cadence === "every_n" ? n : undefined,
      start_on: startOn,
      assignee_id: assignee || null,
    });
    setTitle("");
    setDays([]);
  }

  return (
    <form onSubmit={add} className="mt-3 flex flex-col gap-3">
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Chore" aria-label="Chore" className={field} />
      <div role="group" aria-label="How often" className="flex flex-wrap gap-2">
        {CADENCES.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={cadence === c.id}
            onClick={() => setCadence(c.id)}
            className={`min-h-14 flex-1 rounded-xl border px-3 font-medium ${cadence === c.id ? "border-accent bg-accent text-accent-ink" : "border-line bg-paper"}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {cadence === "weekly" && (
        <div role="group" aria-label="Repeats on" className="flex gap-2">
          {ALL_WEEKDAYS.map((d) => {
            const on = days.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                aria-label={WEEKDAY_NAMES[d]}
                onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d].sort())}
                className={`min-h-14 min-w-0 flex-1 rounded-xl border font-medium ${on ? "border-accent bg-accent text-accent-ink" : "border-line bg-paper"}`}
              >
                {WEEKDAY_LETTERS[d]}
              </button>
            );
          })}
        </div>
      )}
      {cadence === "every_n" && (
        <label className="flex items-center gap-3">
          <span>Every</span>
          <input value={every} onChange={(e) => setEvery(e.target.value)} inputMode="numeric" aria-label="Number of days" className={`${field} w-24`} />
          <span>days</span>
        </label>
      )}
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2">
          <span>{cadence === "once" ? "Due" : "Starting"}</span>
          <input type="date" value={startOn} onChange={(e) => setStartOn(e.target.value)} className={field} />
        </label>
        <label className="flex items-center gap-2">
          <span>For</span>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={field}>
            <option value="">Anyone</option>
            {week.people
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <button type="submit" disabled={!ready} className="min-h-14 self-start rounded-xl bg-accent px-6 font-medium text-accent-ink disabled:opacity-50">
        Add chore
      </button>
    </form>
  );
}

/** Add and retire people and chores. Opens above the week and closes again; the week stays where it was. */
export default function Manage({ week, today, send }: { week: WeekData; today: string; send: Send }) {
  const people = week.people.filter((p) => p.active);
  return (
    <div className="mb-3 grid gap-3 md:grid-cols-2">
      <section aria-labelledby="people-h" className="rounded-2xl border border-line bg-surface p-4">
        <h2 id="people-h" className="text-lg font-semibold">
          People
        </h2>
        {people.length === 0 ? (
          <p className="mt-2 text-sm text-ink/70">No one yet. Add the people who do the chores.</p>
        ) : (
          <ul className="mt-2">
            {people.map((p) => (
              <li key={p.id} className="flex items-center gap-2 border-b border-line/40 py-2 last:border-0">
                <span className="min-w-0 flex-1 text-base">{p.name}</span>
                <Retire label={p.name} onRetire={() => void send(`Retire person: ${p.name}`, "/api/people", { op: "retire", id: p.id })} />
              </li>
            ))}
          </ul>
        )}
        <AddPerson send={send} />
      </section>
      <section aria-labelledby="chores-h" className="rounded-2xl border border-line bg-surface p-4">
        <h2 id="chores-h" className="text-lg font-semibold">
          Chores
        </h2>
        {week.chores.length === 0 ? (
          <p className="mt-2 text-sm text-ink/70">No chores yet.</p>
        ) : (
          <ul className="mt-2">
            {week.chores.map((c) => (
              <li key={c.id} className="flex items-center gap-2 border-b border-line/40 py-2 last:border-0">
                <span className="min-w-0 flex-1">
                  <span className="block text-base">{c.title}</span>
                  <span className="block text-sm text-ink/60">{cadenceLabel(c)}</span>
                </span>
                <Retire label={c.title} onRetire={() => void send(`Retire chore: ${c.title}`, "/api/chores", { op: "retire", id: c.id })} />
              </li>
            ))}
          </ul>
        )}
        <AddChore week={week} today={today} send={send} />
      </section>
    </div>
  );
}
