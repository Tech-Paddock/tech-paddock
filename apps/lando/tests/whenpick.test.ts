// #64: the Day and Time pop-ups' pure parts.
import { describe, expect, it } from "vitest";
import {
  QUICK_AGO,
  clampTo,
  dayDisabled,
  floorToStep,
  hourDisabled,
  localStep,
  minuteDisabled,
  minuteOptions,
  monthCells,
  pmDisabled,
  quickValue,
  shiftMonth,
} from "@/lib/whenpick";

const NOW = new Date(2026, 10, 17, 14, 38, 41, 500);

describe("five-minute steps", () => {
  it("rounds down, never up, and drops the seconds", () => {
    expect(localStep(NOW)).toBe("2026-11-17T14:35");
    expect(localStep(new Date(2026, 10, 17, 14, 40, 0))).toBe("2026-11-17T14:40");
    expect(localStep(new Date(2026, 10, 17, 14, 59, 59))).toBe("2026-11-17T14:55");
    expect(floorToStep(NOW).getSeconds()).toBe(0);
    expect(floorToStep(NOW).getMilliseconds()).toBe(0);
  });

  it("lists :00 to :55, plus an older entry's own minute in its place", () => {
    expect(minuteOptions(35)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
    expect(minuteOptions(7)).toEqual([0, 5, 7, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
    expect(minuteOptions(59).at(-1)).toBe(59);
  });
});

describe("the minutes-ago shortcuts", () => {
  it("are Now, 15, 30 and 45 min ago and 1 hr ago, on a step", () => {
    expect(QUICK_AGO.map(([, t]) => t)).toEqual(["Now", "15 min ago", "30 min ago", "45 min ago", "1 hr ago"]);
    expect(QUICK_AGO.map(([m]) => quickValue(m, NOW))).toEqual([
      "2026-11-17T14:35",
      "2026-11-17T14:20",
      "2026-11-17T14:05",
      "2026-11-17T13:50",
      "2026-11-17T13:35",
    ]);
  });

  it("cross midnight", () => {
    expect(quickValue(60, new Date(2026, 10, 17, 0, 12))).toBe("2026-11-16T23:10");
  });
});

describe("what a form that can't be in the future greys out", () => {
  const max = "2026-11-17T14:38"; // 2:38 PM
  it("clamps a time past now to now on a step, and leaves earlier ones and no limit alone", () => {
    expect(clampTo("2026-11-17T14:55", max)).toBe("2026-11-17T14:35");
    expect(clampTo("2026-11-18T09:00", max)).toBe("2026-11-17T14:35");
    expect(clampTo("2026-11-17T14:38", max)).toBe("2026-11-17T14:38");
    expect(clampTo("2026-11-17T09:00", max)).toBe("2026-11-17T09:00");
    expect(clampTo("2030-01-01T09:00", undefined)).toBe("2030-01-01T09:00");
  });

  it("greys out days after today", () => {
    expect(dayDisabled("2026-11-18", max)).toBe(true);
    expect(dayDisabled("2026-11-17", max)).toBe(false);
    expect(dayDisabled("2026-11-01", max)).toBe(false);
    expect(dayDisabled("2030-01-01", undefined)).toBe(false);
  });

  it("greys out hours after now today (12-hour face), none on an earlier day, all on a later one", () => {
    const today = "2026-11-17T09:00";
    expect(hourDisabled(today, max, 2, true)).toBe(false); // 2 PM
    expect(hourDisabled(today, max, 3, true)).toBe(true); // 3 PM
    expect(hourDisabled(today, max, 12, true)).toBe(false); // 12 PM is noon
    expect(hourDisabled(today, max, 11, false)).toBe(false); // 11 AM
    expect(hourDisabled("2026-11-16T09:00", max, 11, true)).toBe(false);
    expect(hourDisabled("2026-11-18T09:00", max, 1, false)).toBe(true);
    expect(hourDisabled(today, undefined, 11, true)).toBe(false);
  });

  it("greys out minutes after now in this hour only", () => {
    expect(minuteDisabled("2026-11-17T14:00", max, 40)).toBe(true);
    expect(minuteDisabled("2026-11-17T14:00", max, 35)).toBe(false);
    expect(minuteDisabled("2026-11-17T13:00", max, 55)).toBe(false);
    expect(minuteDisabled("2026-11-16T14:00", max, 55)).toBe(false);
  });

  it("greys out PM before noon", () => {
    expect(pmDisabled("2026-11-17T09:00", "2026-11-17T09:12")).toBe(true);
    expect(pmDisabled("2026-11-17T09:00", "2026-11-17T12:00")).toBe(false);
    expect(pmDisabled("2026-11-16T09:00", "2026-11-17T09:12")).toBe(false);
  });
});

describe("the month grid", () => {
  it("starts on Sunday with blanks before the 1st, and has every day once", () => {
    const nov = monthCells(2026, 10); // November 2026 starts on a Sunday
    expect(nov[0]).toEqual({ day: "2026-11-01", n: 1 });
    expect(nov).toHaveLength(30);
    const dec = monthCells(2026, 11); // December 2026 starts on a Tuesday
    expect(dec.slice(0, 2)).toEqual([null, null]);
    expect(dec[2]).toEqual({ day: "2026-12-01", n: 1 });
    expect(dec.at(-1)).toEqual({ day: "2026-12-31", n: 31 });
  });

  it("knows a leap February", () => {
    expect(monthCells(2028, 1).filter(Boolean)).toHaveLength(29);
    expect(monthCells(2027, 1).filter(Boolean)).toHaveLength(28);
  });

  it("pages across a year end", () => {
    expect(shiftMonth("2026-12-15", 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth("2026-01-15", -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth("2026-11-17", 0)).toEqual({ year: 2026, month: 10 });
  });
});
