import { describe, expect, it } from "vitest";
import { parseCalendarEvent, addMinutes } from "@/lib/calendar/validate";
import { Invalid } from "@/lib/validate";

const timed = { app: "lando", source_id: "plan-1", op: "upsert", title: "Vet visit", start: "2026-12-01T09:30" };

describe("parseCalendarEvent", () => {
  it("normalises a timed event and defaults its end to an hour later", () => {
    expect(parseCalendarEvent(timed)).toEqual({
      op: "upsert", app: "lando", source_id: "plan-1", title: "Vet visit", all_day: false,
      start: "2026-12-01T09:30:00", end: "2026-12-01T10:30:00", recurrence: null, notes: null,
    });
  });

  it("an hour later can cross midnight", () => {
    expect(addMinutes("2026-12-31T23:30:00", 60)).toBe("2027-01-01T00:30:00");
  });

  it("an all-day event is days; its end is the last day, inclusive, defaulting to the start", () => {
    const e = parseCalendarEvent({ ...timed, all_day: true, start: "2026-12-01" });
    expect(e).toMatchObject({ all_day: true, start: "2026-12-01", end: "2026-12-01" });
    expect(parseCalendarEvent({ ...timed, all_day: true, start: "2026-12-01", end: "2026-12-03" })).toMatchObject({ end: "2026-12-03" });
  });

  it("refuses a time with an offset or Z rather than guessing a zone", () => {
    expect(() => parseCalendarEvent({ ...timed, start: "2026-12-01T09:30:00Z" })).toThrow(Invalid);
    expect(() => parseCalendarEvent({ ...timed, start: "2026-12-01T09:30:00-07:00" })).toThrow(Invalid);
  });

  it("refuses an impossible day or time, an end before the start, and the wrong shape for all-day", () => {
    expect(() => parseCalendarEvent({ ...timed, start: "2026-02-30T09:00" })).toThrow(Invalid);
    expect(() => parseCalendarEvent({ ...timed, start: "2026-12-01T25:00" })).toThrow(Invalid);
    expect(() => parseCalendarEvent({ ...timed, end: "2026-12-01T09:00" })).toThrow(Invalid);
    expect(() => parseCalendarEvent({ ...timed, all_day: true })).toThrow(Invalid);
    expect(() => parseCalendarEvent({ ...timed, all_day: true, start: "2026-12-02", end: "2026-12-01" })).toThrow(Invalid);
  });

  it("a delete needs only the app and the id", () => {
    expect(parseCalendarEvent({ app: "lando", source_id: "plan-1", op: "delete" })).toEqual({ op: "delete", app: "lando", source_id: "plan-1" });
  });

  it("refuses a bad app slug, an unknown op, a missing title and a non-object", () => {
    expect(() => parseCalendarEvent({ ...timed, app: "Lando" })).toThrow(Invalid);
    expect(() => parseCalendarEvent({ ...timed, app: "../grid" })).toThrow(Invalid);
    expect(() => parseCalendarEvent({ ...timed, op: "move" })).toThrow(Invalid);
    expect(() => parseCalendarEvent({ ...timed, title: "  " })).toThrow(Invalid);
    expect(() => parseCalendarEvent(null)).toThrow(Invalid);
    expect(() => parseCalendarEvent([])).toThrow(Invalid);
  });

  it("a message never repeats what was sent", () => {
    for (const bad of [{ ...timed, title: "x".repeat(500) }, { ...timed, start: "private words" }, { ...timed, app: "private words" }]) {
      try {
        parseCalendarEvent(bad);
        expect.unreachable();
      } catch (e) {
        expect((e as Error).message).not.toMatch(/private words|xxxx/);
      }
    }
  });

  describe("recurrence", () => {
    it("takes freq, an interval of 1 by default, weekdays sorted, and an until day", () => {
      const e = parseCalendarEvent({ ...timed, recurrence: { freq: "weekly", days_of_week: ["Friday", "monday"], until: "2027-03-01" } });
      expect((e as { recurrence: unknown }).recurrence).toEqual({ freq: "weekly", interval: 1, days_of_week: ["monday", "friday"], until: "2027-03-01" });
    });

    it("refuses an unknown freq, a bad interval, weekdays on a non-weekly repeat, and an until before the start", () => {
      const r = (recurrence: unknown) => () => parseCalendarEvent({ ...timed, recurrence });
      expect(r({ freq: "hourly" })).toThrow(Invalid);
      expect(r({ freq: "daily", interval: 0 })).toThrow(Invalid);
      expect(r({ freq: "daily", interval: 1.5 })).toThrow(Invalid);
      expect(r({ freq: "monthly", days_of_week: ["monday"] })).toThrow(Invalid);
      expect(r({ freq: "weekly", days_of_week: ["someday"] })).toThrow(Invalid);
      expect(r({ freq: "weekly", until: "2026-11-30" })).toThrow(Invalid);
    });
  });
});
