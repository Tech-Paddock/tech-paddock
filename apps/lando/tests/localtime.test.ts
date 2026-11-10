import { describe, expect, it } from "vitest";
import { DATE_ONLY_HOUR, clock12, dateLabel, fromDateInput, rowTime, toDateInput, toLocalInput, whenLabel, withClock, withDay } from "@/lib/localtime";

describe("weight dates — a day, stored at local noon", () => {
  it("turns a picked date into local noon that day", () => {
    const iso = fromDateInput("2026-10-19")!;
    const d = new Date(iso);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 19, DATE_ONLY_HOUR, 0]);
    expect(iso).toBe(new Date(2026, 9, 19, 12).toISOString());
  });

  it("round-trips to the same calendar day, never the day before", () => {
    for (const v of ["2026-01-01", "2026-03-08", "2026-03-29", "2026-10-25", "2026-11-01", "2026-12-31", "2028-02-29"]) {
      expect(toDateInput(fromDateInput(v)!)).toBe(v);
    }
  });

  it("is null for an empty, malformed or impossible date", () => {
    for (const v of ["", "2026-10", "10/19/2026", "2026-02-30", "2026-13-01", "2026-10-19T09:00"]) {
      expect(fromDateInput(v)).toBeNull();
    }
  });

  it("labels the day: Today, Yesterday, then the date", () => {
    const now = new Date(2026, 9, 21, 8, 0);
    expect(dateLabel("2026-10-21", now)).toBe("Today");
    expect(dateLabel("2026-10-20", now)).toBe("Yesterday");
    const older = dateLabel("2026-10-19", now);
    expect(older).toMatch(/19/);
    expect(older).not.toMatch(/:|26/);
    expect(dateLabel("2025-12-31", now)).toMatch(/25/);
    expect(dateLabel("nonsense", now)).toBe("");
  });

  it("shows a weight's timeline row by day and every other kind by clock", () => {
    const now = new Date(2026, 9, 21, 8, 0);
    const at = new Date(2026, 9, 21, 12).toISOString();
    expect(rowTime("weight", at, now)).toBe("Today");
    expect(rowTime("potty", at, now)).toMatch(/12:00/);
  });
});

const now = new Date(2026, 9, 21, 14, 0);
const at = (y: number, m: number, d: number, h: number, min = 0) => toLocalInput(new Date(y, m, d, h, min).toISOString());

describe("whenLabel", () => {
  it("says Today for a time on the phone's current day", () => {
    expect(whenLabel(at(2026, 9, 21, 0, 5), now)).toMatch(/^Today /);
    expect(whenLabel(at(2026, 9, 21, 23, 59), now)).toMatch(/^Today /);
  });

  it("says Yesterday for the day before, even just before midnight", () => {
    expect(whenLabel(at(2026, 9, 20, 23, 59), now)).toMatch(/^Yesterday /);
  });

  it("names the date further back, and the year only when it differs", () => {
    const older = whenLabel(at(2026, 9, 18, 9), now);
    expect(older).not.toMatch(/^(Today|Yesterday)/);
    expect(older).not.toMatch(/26/);
    expect(whenLabel(at(2025, 11, 31, 9), now)).toMatch(/25/);
  });

  it("stays short enough for half a phone-width row", () => {
    expect(whenLabel(at(2025, 8, 30, 22, 30), now).length).toBeLessThanOrEqual(22);
  });

  it("is empty for an empty or unreadable value", () => {
    expect(whenLabel("", now)).toBe("");
    expect(whenLabel("nonsense", now)).toBe("");
  });
});

describe("the When row's clock (TEC-261)", () => {
  it("reads a local time as a 12-hour face", () => {
    expect(clock12("2026-11-09T00:05")).toEqual({ hour: 12, minute: 5, pm: false });
    expect(clock12("2026-11-09T09:30")).toEqual({ hour: 9, minute: 30, pm: false });
    expect(clock12("2026-11-09T12:00")).toEqual({ hour: 12, minute: 0, pm: true });
    expect(clock12("2026-11-09T23:59")).toEqual({ hour: 11, minute: 59, pm: true });
  });

  it("builds the time back, with 12 AM as midnight and 12 PM as noon", () => {
    expect(withClock("2026-11-09T09:30", { hour: 12, minute: 0, pm: false })).toBe("2026-11-09T00:00");
    expect(withClock("2026-11-09T09:30", { hour: 12, minute: 0, pm: true })).toBe("2026-11-09T12:00");
    expect(withClock("2026-11-09T09:30", { hour: 4, minute: 7, pm: true })).toBe("2026-11-09T16:07");
  });

  it("round-trips every minute of a day", () => {
    for (let h = 0; h < 24; h++) for (const m of [0, 1, 30, 59]) {
      const v = `2026-11-09T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      expect(withClock(v, clock12(v))).toBe(v);
    }
  });

  it("moves the day and keeps the clock", () => {
    expect(withDay("2026-11-09T16:07", "2026-12-01")).toBe("2026-12-01T16:07");
  });
});
