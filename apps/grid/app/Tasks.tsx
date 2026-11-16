"use client";

import { useState } from "react";
import { shortDay } from "@/lib/days";
import type { Task } from "@/lib/types";
import { uuid } from "@/lib/uuid";
import type { Send } from "./outbox";

/**
 * Today's tasks: what is open and due today or earlier (or has no date), then
 * what was ticked done today. A task with a later date waits behind "Later".
 * A tick shows its intended state at once and only stays once the server has it.
 */
export function splitTasks(tasks: Task[], day: string) {
  const open = tasks.filter((t) => t.done_on == null);
  const now = open
    .filter((t) => t.due_on == null || t.due_on <= day)
    // Overdue first, then today, then no date.
    .sort((a, b) => (a.due_on ?? "9999-12-31").localeCompare(b.due_on ?? "9999-12-31"));
  const later = open.filter((t) => t.due_on != null && t.due_on > day).sort((a, b) => a.due_on!.localeCompare(b.due_on!));
  const done = tasks.filter((t) => t.done_on != null);
  return { now, later, done };
}

function TaskRow({ task, day, send }: { task: Task; day: string; send: Send }) {
  const actual = task.done_on != null;
  const [want, setWant] = useState<boolean | null>(null);
  const shown = want ?? actual;
  const overdue = !shown && task.due_on != null && task.due_on < day;

  async function toggle() {
    setWant(!shown);
    await send(`${shown ? "Reopen" : "Tick"} task: ${task.title}`, "/api/tasks", { op: "done", id: task.id, done: !shown, day });
    setWant(null);
  }

  return (
    <li className="flex items-start gap-1 border-b border-line/40 py-1 last:border-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={shown}
        aria-label={task.title}
        onClick={toggle}
        className="flex h-11 w-11 shrink-0 items-center justify-center"
      >
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-md border-2 ${shown ? "border-accent bg-accent text-accent-ink" : "border-line"} ${want != null ? "opacity-60" : ""}`}
          aria-hidden="true"
        >
          {shown ? "✓" : ""}
        </span>
      </button>
      <div className="min-w-0 flex-1 py-2">
        <p className={`break-words ${shown ? "text-ink/50 line-through" : ""}`}>{task.title}</p>
        {!shown && (
          <label className="mt-1 flex items-center gap-2 text-xs text-ink/70">
            <span className={overdue ? "font-semibold text-urgent" : ""}>
              {task.due_on ? (overdue ? `Overdue, ${shortDay(task.due_on)}` : `Due ${shortDay(task.due_on)}`) : "No date"}
            </span>
            <input
              type="date"
              aria-label={`Due date for ${task.title}`}
              value={task.due_on ?? ""}
              onChange={(e) => void send(`Due date: ${task.title}`, "/api/tasks", { op: "due", id: task.id, due_on: e.target.value || null })}
              className="min-h-9 rounded-md border border-line bg-surface px-2 text-xs"
            />
          </label>
        )}
      </div>
    </li>
  );
}

export default function Tasks({ tasks, day, send }: { tasks: Task[]; day: string; send: Send }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [dating, setDating] = useState(false);
  const { now, later, done } = splitTasks(tasks, day);

  function add(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    // Cleared at once: the save now lives in the outbox, which keeps it until it lands.
    void send(`Add task: ${t}`, "/api/tasks", { op: "add", id: uuid(), title: t, due_on: due || null });
    setTitle("");
    setDue("");
    setDating(false);
  }

  return (
    <section aria-labelledby="tasks-h" className="rounded-2xl border border-line bg-surface p-4">
      <h2 id="tasks-h" className="text-lg font-semibold">
        Tasks
      </h2>
      <form onSubmit={add} className="mt-3 flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="Add a task"
            aria-label="New task"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 outline-none focus:border-accent"
          />
          <button type="submit" disabled={!title.trim()} className="min-h-11 rounded-lg bg-accent px-4 font-medium text-accent-ink disabled:opacity-50">
            Add
          </button>
        </div>
        {dating ? (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink/70">Due</span>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              aria-label="Due date for the new task"
              className="min-h-11 rounded-lg border border-line bg-paper px-2"
            />
          </label>
        ) : (
          <button type="button" onClick={() => setDating(true)} className="min-h-11 self-start text-sm text-ink/70 underline">
            Set a due date
          </button>
        )}
      </form>

      {now.length === 0 && done.length === 0 && <p className="mt-3 text-sm text-ink/70">Nothing due. Add a task above.</p>}
      {now.length > 0 && (
        <ul className="mt-2">
          {now.map((t) => (
            <TaskRow key={t.id} task={t} day={day} send={send} />
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <ul className="mt-2">
          {done.map((t) => (
            <TaskRow key={t.id} task={t} day={day} send={send} />
          ))}
        </ul>
      )}
      {later.length > 0 && (
        <details className="mt-2">
          <summary className="min-h-11 cursor-pointer py-3 text-sm text-ink/70">Later ({later.length})</summary>
          <ul>
            {later.map((t) => (
              <TaskRow key={t.id} task={t} day={day} send={send} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
