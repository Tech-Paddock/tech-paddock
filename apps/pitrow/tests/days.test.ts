import { describe, expect, it } from "vitest";
import { addDays, diffDays, isDay, localDay, shortDay, weekdayOf } from "@/lib/days";

describe("days", () => {
  it("accepts only real calendar days", () => {
    expect(isDay("2026-02-28")).toBe(true);
    expect(isDay("2028-02-29")).toBe(true);
    expect(isDay("2026-02-29")).toBe(false);
    expect(isDay("2026-13-01")).toBe(false);
    expect(isDay("2026-1-1")).toBe(false);
    expect(isDay("2026-01-01T00:00")).toBe(false);
    expect(isDay(20260101)).toBe(false);
    expect(isDay(null)).toBe(false);
  });

  it("reads the device's local day, not the UTC one", () => {
    expect(localDay(new Date(2026, 10, 12, 23, 59))).toBe("2026-11-12");
    expect(localDay(new Date(2026, 0, 5, 0, 1))).toBe("2026-01-05");
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-11-12", 0)).toBe("2026-11-12");
  });

  it("counts the days between two days, over a clock change", () => {
    expect(diffDays("2026-11-01", "2026-11-04")).toBe(3);
    expect(diffDays("2026-03-07", "2026-03-10")).toBe(3);
    expect(diffDays("2026-11-04", "2026-11-01")).toBe(-3);
  });

  it("numbers weekdays from Sunday as 0", () => {
    expect(weekdayOf("2026-11-15")).toBe(0);
    expect(weekdayOf("2026-11-16")).toBe(1);
    expect(weekdayOf("2026-11-21")).toBe(6);
  });

  it("writes a short day", () => {
    expect(shortDay("2026-11-12")).toBe("Thu 12 Nov");
  });
});
