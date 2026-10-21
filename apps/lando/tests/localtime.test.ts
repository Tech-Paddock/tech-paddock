import { describe, expect, it } from "vitest";
import { toLocalInput, whenLabel } from "@/lib/localtime";

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
