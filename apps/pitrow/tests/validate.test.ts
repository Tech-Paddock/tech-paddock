import { describe, expect, it } from "vitest";
import { Invalid, parseChore, parseCompletion, parsePerson } from "@/lib/validate";

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("parsePerson", () => {
  it("trims a name and bounds it", () => {
    expect(parsePerson({ op: "add", id: ID, name: "  Sam  " })).toEqual({ op: "add", id: ID, name: "Sam" });
    expect(() => parsePerson({ op: "add", id: ID, name: "" })).toThrow(Invalid);
    expect(() => parsePerson({ op: "add", id: ID, name: "x".repeat(41) })).toThrow(Invalid);
    expect(() => parsePerson({ op: "delete", id: ID })).toThrow(Invalid);
  });
});

describe("parseChore", () => {
  const base = { op: "add", id: ID, title: "Bins", start_on: "2026-11-24" };
  it("each cadence carries only its own fields", () => {
    expect(parseChore({ ...base, cadence: "once", weekdays: [1], every_n: 4 })).toMatchObject({ weekdays: null, every_n: null });
    expect(parseChore({ ...base, cadence: "weekly", weekdays: [5, 1, 1] })).toMatchObject({ weekdays: [1, 5], every_n: null });
    expect(parseChore({ ...base, cadence: "every_n", every_n: 3, weekdays: [1] })).toMatchObject({ weekdays: null, every_n: 3 });
  });
  it("refuses what the table would", () => {
    expect(() => parseChore({ ...base, cadence: "weekly" })).toThrow(Invalid);
    expect(() => parseChore({ ...base, cadence: "weekly", weekdays: [7] })).toThrow(Invalid);
    expect(() => parseChore({ ...base, cadence: "every_n", every_n: 1 })).toThrow(Invalid);
    expect(() => parseChore({ ...base, cadence: "every_n", every_n: 366 })).toThrow(Invalid);
    expect(() => parseChore({ ...base, cadence: "monthly" })).toThrow(Invalid);
    expect(() => parseChore({ ...base, cadence: "daily", start_on: "2026-02-30" })).toThrow(Invalid);
    expect(() => parseChore({ ...base, cadence: "daily", title: " " })).toThrow(Invalid);
  });
  it("an assignee is optional", () => {
    expect(parseChore({ ...base, cadence: "daily" })).toMatchObject({ assignee_id: null });
    expect(parseChore({ ...base, cadence: "daily", assignee_id: OTHER })).toMatchObject({ assignee_id: OTHER });
  });
  it("a refusal never repeats what was typed", () => {
    try {
      parseChore({ ...base, title: "secret words ".repeat(30), cadence: "daily" });
    } catch (e) {
      expect((e as Error).message).not.toContain("secret");
    }
  });
});

describe("parseCompletion", () => {
  it("a tick names chore, day and person; a void names only the tick", () => {
    expect(parseCompletion({ op: "done", id: ID, chore_id: OTHER, day: "2026-11-24", person_id: OTHER })).toMatchObject({ op: "done" });
    expect(parseCompletion({ op: "void", id: ID, completion_id: OTHER })).toEqual({ op: "void", id: ID, completion_id: OTHER });
    expect(() => parseCompletion({ op: "done", id: ID, chore_id: OTHER, day: "soon", person_id: OTHER })).toThrow(Invalid);
    expect(() => parseCompletion({ op: "update", id: ID })).toThrow(Invalid);
  });
});
