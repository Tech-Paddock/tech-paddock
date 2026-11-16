import { describe, expect, it } from "vitest";
import {
  Invalid,
  JOURNAL_MAX,
  parseGoal,
  parseJournal,
  parseList,
  parseMeditation,
  parseRoutine,
  parseTask,
  parseWeekdays,
} from "@/lib/validate";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("tasks", () => {
  it("adds with an optional due date", () => {
    expect(parseTask({ op: "add", id: A, title: "  Water   the plant ", due_on: "2026-11-20" })).toEqual({
      op: "add",
      id: A,
      title: "Water the plant",
      due_on: "2026-11-20",
    });
    expect(parseTask({ op: "add", id: A, title: "x", due_on: "" })).toMatchObject({ due_on: null });
    expect(parseTask({ op: "add", id: A, title: "x" })).toMatchObject({ due_on: null });
  });

  it("marks done on the browser's day, and clears a due date with null", () => {
    expect(parseTask({ op: "done", id: A, done: true, day: "2026-11-16" })).toEqual({ op: "done", id: A, done: true, day: "2026-11-16" });
    expect(parseTask({ op: "due", id: A, due_on: null })).toEqual({ op: "due", id: A, due_on: null });
  });

  it("refuses an empty title, a bad id, a bad date and an unknown op", () => {
    expect(() => parseTask({ op: "add", id: A, title: "   " })).toThrow(Invalid);
    expect(() => parseTask({ op: "add", id: "nope", title: "x" })).toThrow(Invalid);
    expect(() => parseTask({ op: "add", id: A, title: "x", due_on: "2026-02-30" })).toThrow(Invalid);
    expect(() => parseTask({ op: "delete", id: A })).toThrow(Invalid);
    expect(() => parseTask(null)).toThrow(Invalid);
    expect(() => parseTask({ op: "done", id: A, done: "yes", day: "2026-11-16" })).toThrow(Invalid);
  });

  it("never repeats what was typed in a refusal", () => {
    const typed = "an invented sentence that must not travel back";
    for (const body of [{ op: "add", id: "bad", title: typed }, { op: "add", id: A, title: typed, due_on: "no" }]) {
      try {
        parseTask(body);
        throw new Error("should have refused");
      } catch (e) {
        expect((e as Error).message).not.toContain("invented");
      }
    }
    try {
      parseTask({ op: "add", id: A, title: "x".repeat(201) });
    } catch (e) {
      expect((e as Error).message).not.toContain("xxx");
    }
  });
});

describe("routines", () => {
  it("adds with weekdays, sorted and de-duplicated", () => {
    expect(parseRoutine({ op: "add", id: A, name: "Stretch", weekdays: [3, 1, 1, 5] })).toEqual({
      op: "add",
      id: A,
      name: "Stretch",
      weekdays: [1, 3, 5],
    });
  });

  it("needs at least one weekday, all of them 0 to 6", () => {
    expect(() => parseWeekdays([])).toThrow(Invalid);
    expect(() => parseWeekdays([7])).toThrow(Invalid);
    expect(() => parseWeekdays([1.5])).toThrow(Invalid);
    expect(() => parseWeekdays("1")).toThrow(Invalid);
  });

  it("ticks one routine on one day, and archives", () => {
    expect(parseRoutine({ op: "tick", routine_id: A, day: "2026-11-16", ticked: false })).toEqual({
      op: "tick",
      routine_id: A,
      day: "2026-11-16",
      ticked: false,
    });
    expect(parseRoutine({ op: "archive", id: A })).toEqual({ op: "archive", id: A });
  });
});

describe("the journal", () => {
  it("has one op, save, which is always a new version", () => {
    expect(parseJournal({ op: "save", id: A, entry_id: B, day: "2026-11-16", body: "  line one\nline two  " })).toEqual({
      op: "save",
      id: A,
      entry_id: B,
      day: "2026-11-16",
      body: "line one\nline two",
    });
    for (const op of ["update", "edit", "delete", "rewrite"]) {
      expect(() => parseJournal({ op, id: A, entry_id: B, day: "2026-11-16", body: "x" })).toThrow(Invalid);
    }
  });

  it("refuses an empty or oversize entry", () => {
    expect(() => parseJournal({ op: "save", id: A, entry_id: B, day: "2026-11-16", body: "  \n " })).toThrow(Invalid);
    expect(() => parseJournal({ op: "save", id: A, entry_id: B, day: "2026-11-16", body: "a".repeat(JOURNAL_MAX + 1) })).toThrow(Invalid);
    expect(() => parseJournal({ op: "save", id: A, entry_id: "x", day: "2026-11-16", body: "a" })).toThrow(Invalid);
  });
});

describe("meditation", () => {
  const ok = { op: "log", id: A, day: "2026-11-16", planned_seconds: 300, elapsed_seconds: 300, finished: true };

  it("logs a sitting", () => {
    expect(parseMeditation(ok)).toEqual(ok);
  });

  it("clamps the time run to the time planned", () => {
    expect(parseMeditation({ ...ok, elapsed_seconds: 999 }).elapsed_seconds).toBe(300);
  });

  it("refuses a length out of range or a fractional one", () => {
    expect(() => parseMeditation({ ...ok, planned_seconds: 5 })).toThrow(Invalid);
    expect(() => parseMeditation({ ...ok, planned_seconds: 99999 })).toThrow(Invalid);
    expect(() => parseMeditation({ ...ok, elapsed_seconds: -1 })).toThrow(Invalid);
    expect(() => parseMeditation({ ...ok, elapsed_seconds: 1.5 })).toThrow(Invalid);
    expect(() => parseMeditation({ ...ok, finished: "yes" })).toThrow(Invalid);
  });
});

describe("goals and lists", () => {
  it("parses each op", () => {
    expect(parseGoal({ op: "add", id: A, title: "Read more" })).toEqual({ op: "add", id: A, title: "Read more" });
    expect(parseGoal({ op: "done", id: A, done: true })).toEqual({ op: "done", id: A, done: true });
    expect(parseList({ op: "add_list", id: A, name: "Errands" })).toEqual({ op: "add_list", id: A, name: "Errands" });
    expect(parseList({ op: "add_item", id: A, list_id: B, text: "Stamps" })).toEqual({ op: "add_item", id: A, list_id: B, text: "Stamps" });
    expect(parseList({ op: "done_item", id: A, done: false })).toEqual({ op: "done_item", id: A, done: false });
  });

  it("refuses the wrong shape", () => {
    expect(() => parseGoal({ op: "add", id: A, title: "" })).toThrow(Invalid);
    expect(() => parseList({ op: "add_item", id: A, text: "x" })).toThrow(Invalid);
    expect(() => parseList({ op: "add_list", id: A, name: 3 })).toThrow(Invalid);
  });
});
