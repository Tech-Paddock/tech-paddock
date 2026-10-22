import { describe, expect, it } from "vitest";
import { DATE_ONLY_HOUR, dateLabel, fromDateInput, rowTime, toDateInput, toLocalInput, whenLabel } from "@/lib/localtime";

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
