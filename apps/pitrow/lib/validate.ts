import { ALL_WEEKDAYS, isDay } from "./days";
import type { Cadence } from "./types";

/**
 * What a request may say. Every write is an `op` on its resource, with ids the
 * browser made (a retried save lands once) and days the browser's own.
 *
 * A message from here travels back to the browser, so it never repeats what was
 * typed: a chore's title or a person's name is never in an error or a log.
 */
export class Invalid extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TITLE_MAX = 200;
export const NAME_MAX = 40;
export const EVERY_N_MIN = 2;
export const EVERY_N_MAX = 365;

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

export type PersonOp = { op: "add"; id: string; name: string } | { op: "retire"; id: string };

export function parsePerson(body: unknown): PersonOp {
  const b = obj(body);
  if (op(b, ["add", "retire"]) === "add") return { op: "add", id: id(b.id, "id"), name: line(b.name, "Name", NAME_MAX) };
  return { op: "retire", id: id(b.id, "id") };
}

export function parseWeekdays(v: unknown): number[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > 7) throw new Invalid("Pick at least one weekday");
  const days = v.map((n) => {
    if (typeof n !== "number" || !ALL_WEEKDAYS.includes(n)) throw new Invalid("A weekday is 0 (Sunday) to 6");
    return n;
  });
  return [...new Set(days)].sort((a, b) => a - b);
}

export type ChoreOp =
  | {
      op: "add";
      id: string;
      title: string;
      cadence: Cadence;
      weekdays: number[] | null;
      every_n: number | null;
      start_on: string;
      assignee_id: string | null;
    }
  | { op: "retire"; id: string };

export function parseChore(body: unknown): ChoreOp {
  const b = obj(body);
  if (op(b, ["add", "retire"]) === "retire") return { op: "retire", id: id(b.id, "id") };
  const cadence = b.cadence;
  if (cadence !== "once" && cadence !== "daily" && cadence !== "weekly" && cadence !== "every_n") throw new Invalid("Unknown cadence");
  let every_n: number | null = null;
  if (cadence === "every_n") {
    const n = b.every_n;
    if (typeof n !== "number" || !Number.isInteger(n) || n < EVERY_N_MIN || n > EVERY_N_MAX) {
      throw new Invalid(`every_n is ${EVERY_N_MIN} to ${EVERY_N_MAX}`);
    }
    every_n = n;
  }
  return {
    op: "add",
    id: id(b.id, "id"),
    title: line(b.title, "Title", TITLE_MAX),
    cadence,
    weekdays: cadence === "weekly" ? parseWeekdays(b.weekdays) : null,
    every_n,
    start_on: day(b.start_on, "start_on"),
    assignee_id: b.assignee_id == null || b.assignee_id === "" ? null : id(b.assignee_id, "assignee_id"),
  };
}

/** A tick, or the void that takes one back. A void names the tick; the server copies the rest from it. */
export type CompletionOp =
  | { op: "done"; id: string; chore_id: string; day: string; person_id: string }
  | { op: "void"; id: string; completion_id: string };

export function parseCompletion(body: unknown): CompletionOp {
  const b = obj(body);
  if (op(b, ["done", "void"]) === "done") {
    return { op: "done", id: id(b.id, "id"), chore_id: id(b.chore_id, "chore_id"), day: day(b.day, "day"), person_id: id(b.person_id, "person_id") };
  }
  return { op: "void", id: id(b.id, "id"), completion_id: id(b.completion_id, "completion_id") };
}
