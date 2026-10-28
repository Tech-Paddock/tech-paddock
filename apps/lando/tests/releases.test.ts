import { describe, expect, it } from "vitest";
import { DAYS_SHOWN, DAY_SUMMARIES, RELEASES, shownDays, type Release } from "@/lib/releases";

const PLAIN = /TEC-\d|\.tsx?\b|migration|token/i;

describe("release notes", () => {
  it("has a valid date and a plain sentence on every entry", () => {
    for (const r of RELEASES) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const d = new Date(`${r.date}T00:00:00Z`);
      expect(Number.isNaN(d.getTime())).toBe(false);
      expect(d.toISOString().slice(0, 10)).toBe(r.date);
      expect(r.text.trim().length).toBeGreaterThan(0);
      expect(r.text).not.toMatch(PLAIN);
    }
  });

  it("runs newest first", () => {
    for (let i = 1; i < RELEASES.length; i++) {
      expect(RELEASES[i - 1].date >= RELEASES[i].date).toBe(true);
    }
  });

  it("has a plain one-line summary for every day that has entries, and for no other day", () => {
    const days = new Set(RELEASES.map((r) => r.date));
    for (const date of days) {
      expect(DAY_SUMMARIES[date]?.trim().length, `summary for ${date}`).toBeGreaterThan(0);
      expect(DAY_SUMMARIES[date]).not.toMatch(PLAIN);
      expect(DAY_SUMMARIES[date]).not.toMatch(/\n|\|/);
    }
    expect(Object.keys(DAY_SUMMARIES).filter((d) => !days.has(d))).toEqual([]);
  });

  it("shows whole days, newest first, with each day's entries in the order written", () => {
    const shown = shownDays();
    expect(shown.length).toBeLessThanOrEqual(DAYS_SHOWN);
    expect(shown.length).toBe(Math.min(DAYS_SHOWN, new Set(RELEASES.map((r) => r.date)).size));
    for (let i = 1; i < shown.length; i++) expect(shown[i - 1].date > shown[i].date).toBe(true);
    for (const d of shown) {
      expect(d.summary).toBe(DAY_SUMMARIES[d.date]);
      expect(d.items).toEqual(RELEASES.filter((r) => r.date === d.date).map((r) => r.text));
    }
  });

  it("never cuts a day short: a day is all of its entries or not shown", () => {
    const list: Release[] = [
      { date: "2026-03-03", text: "c1" },
      { date: "2026-03-03", text: "c2" },
      { date: "2026-03-02", text: "b1" },
      { date: "2026-03-01", text: "a1" },
      { date: "2026-03-01", text: "a2" },
    ];
    const summaries = { "2026-03-03": "C", "2026-03-02": "B", "2026-03-01": "A" };
    expect(shownDays(list, summaries, 2)).toEqual([
      { date: "2026-03-03", summary: "C", items: ["c1", "c2"] },
      { date: "2026-03-02", summary: "B", items: ["b1"] },
    ]);
    expect(shownDays(list, summaries, 5)).toHaveLength(3);
  });
});
