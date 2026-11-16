import { ALL_WEEKDAYS, isDay } from "./days";

/**
 * What a request may say. Every write is an `op` on its resource, with ids the
 * browser made (a retried save lands once) and days the browser's own.
 *
 * A message from here travels back to the browser, so it never repeats what was
 * typed: a journal body or a task title is never in an error, a log or a test.
 */
export class Invalid extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TITLE_MAX = 200;
export const NAME_MAX = 100;
export const JOURNAL_MAX = 20000;
export const MIN_SESSION_SECONDS = 30;
export const MAX_SESSION_SECONDS = 7200;

function obj(b: unknown): Record<string, unknown> {
  if (typeof b !== "object" || b === null || Array.isArray(b)) throw new Invalid("Expected an object");
  return b as Record<string, unknown>;
}

function id(v: unknown, what: string): string {
  if (typeof v !== "string" || !UUID.test(v)) throw new Invalid(`${what} must be a uuid`);
  return v.toLowerCase();
}

function day(v: unknown, what: string): string {
  if (!isDay(v)) throw new Invalid(`${what} must be a day as YYYY-MM-DD`);
  return v;
}

function bool(v: unknown, what: string): boolean {
  if (typeof v !== "boolean") throw new Invalid(`${what} must be true or false`);
  return v;
}

/** One line of text, trimmed, 1 to `max` characters. */
function line(v: unknown, what: string, max: number): string {
  if (typeof v !== "string") throw new Invalid(`${what} must be text`);
  const s = v.trim().replace(/\s+/g, " ");
  if (s.length < 1) throw new Invalid(`${what} is empty`);
  if (s.length > max) throw new Invalid(`${what} is over ${max} characters`);
  return s;
}

function op(b: Record<string, unknown>, allowed: readonly string[]): string {
  if (typeof b.op !== "string" || !allowed.includes(b.op)) throw new Invalid("Unknown op");
  return b.op;
}

export type TaskOp =
  | { op: "add"; id: string; title: string; due_on: string | null }
  | { op: "done"; id: string; done: boolean; day: string }
  | { op: "due"; id: string; due_on: string | null };

export function parseTask(body: unknown): TaskOp {
  const b = obj(body);
  switch (op(b, ["add", "done", "due"])) {
    case "add":
      return {
        op: "add",
        id: id(b.id, "id"),
        title: line(b.title, "Title", TITLE_MAX),
        due_on: b.due_on == null || b.due_on === "" ? null : day(b.due_on, "due_on"),
      };
    case "done":
      return { op: "done", id: id(b.id, "id"), done: bool(b.done, "done"), day: day(b.day, "day") };
    default:
      return {
        op: "due",
        id: id(b.id, "id"),
        due_on: b.due_on == null || b.due_on === "" ? null : day(b.due_on, "due_on"),
      };
  }
}

export function parseWeekdays(v: unknown): number[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > 7) throw new Invalid("Pick at least one weekday");
  const days = v.map((n) => {
    if (typeof n !== "number" || !ALL_WEEKDAYS.includes(n)) throw new Invalid("A weekday is 0 (Sunday) to 6");
    return n;
  });
  return [...new Set(days)].sort((a, b) => a - b);
}

export type RoutineOp =
  | { op: "add"; id: string; name: string; weekdays: number[] }
  | { op: "tick"; routine_id: string; day: string; ticked: boolean }
  | { op: "archive"; id: string };

export function parseRoutine(body: unknown): RoutineOp {
  const b = obj(body);
  switch (op(b, ["add", "tick", "archive"])) {
    case "add":
      return { op: "add", id: id(b.id, "id"), name: line(b.name, "Name", NAME_MAX), weekdays: parseWeekdays(b.weekdays) };
    case "tick":
      return { op: "tick", routine_id: id(b.routine_id, "routine_id"), day: day(b.day, "day"), ticked: bool(b.ticked, "ticked") };
    default:
      return { op: "archive", id: id(b.id, "id") };
  }
}

/** A journal save is always a new version row: `id` is the version, `entry_id` the entry it belongs to (the same id for a first version, or a new one's own). */
export type JournalOp = { op: "save"; id: string; entry_id: string; day: string; body: string };

export function parseJournal(body: unknown): JournalOp {
  const b = obj(body);
  op(b, ["save"]);
  if (typeof b.body !== "string") throw new Invalid("The entry must be text");
  // Only the ends are trimmed: the writer's own line breaks are kept.
  const text = b.body.trim();
  if (text.length < 1) throw new Invalid("The entry is empty");
  if (text.length > JOURNAL_MAX) throw new Invalid(`The entry is over ${JOURNAL_MAX} characters`);
  return { op: "save", id: id(b.id, "id"), entry_id: id(b.entry_id, "entry_id"), day: day(b.day, "day"), body: text };
}

export type MeditationOp = {
  op: "log";
  id: string;
  day: string;
  planned_seconds: number;
  elapsed_seconds: number;
  finished: boolean;
};

export function parseMeditation(body: unknown): MeditationOp {
  const b = obj(body);
  op(b, ["log"]);
  const planned = b.planned_seconds;
  const elapsed = b.elapsed_seconds;
  if (typeof planned !== "number" || !Number.isInteger(planned) || planned < MIN_SESSION_SECONDS || planned > MAX_SESSION_SECONDS) {
    throw new Invalid("planned_seconds is out of range");
  }
  if (typeof elapsed !== "number" || !Number.isInteger(elapsed) || elapsed < 0) throw new Invalid("elapsed_seconds is out of range");
  const finished = bool(b.finished, "finished");
  return {
    op: "log",
    id: id(b.id, "id"),
    day: day(b.day, "day"),
    planned_seconds: planned,
    // A timer cannot have run longer than it was set for.
    elapsed_seconds: Math.min(elapsed, planned),
    finished,
  };
}

export type GoalOp = { op: "add"; id: string; title: string } | { op: "done"; id: string; done: boolean };

export function parseGoal(body: unknown): GoalOp {
  const b = obj(body);
  if (op(b, ["add", "done"]) === "add") return { op: "add", id: id(b.id, "id"), title: line(b.title, "Title", TITLE_MAX) };
  return { op: "done", id: id(b.id, "id"), done: bool(b.done, "done") };
}

export type ListOp =
  | { op: "add_list"; id: string; name: string }
  | { op: "add_item"; id: string; list_id: string; text: string }
  | { op: "done_item"; id: string; done: boolean };

export function parseList(body: unknown): ListOp {
  const b = obj(body);
  switch (op(b, ["add_list", "add_item", "done_item"])) {
    case "add_list":
      return { op: "add_list", id: id(b.id, "id"), name: line(b.name, "Name", NAME_MAX) };
    case "add_item":
      return { op: "add_item", id: id(b.id, "id"), list_id: id(b.list_id, "list_id"), text: line(b.text, "Item", TITLE_MAX) };
    default:
      return { op: "done_item", id: id(b.id, "id"), done: bool(b.done, "done") };
  }
}
