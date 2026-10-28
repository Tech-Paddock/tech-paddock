import { describe, expect, it } from "vitest";
import { RELEASES, RELEASES_SHOWN, shownReleases } from "@/lib/releases";

describe("release notes", () => {
  it("has a valid date and a plain sentence on every entry", () => {
    for (const r of RELEASES) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const d = new Date(`${r.date}T00:00:00Z`);
      expect(Number.isNaN(d.getTime())).toBe(false);
      expect(d.toISOString().slice(0, 10)).toBe(r.date);
      expect(r.text.trim().length).toBeGreaterThan(0);
      expect(r.text).not.toMatch(/TEC-\d|\.tsx?\b|migration|token/i);
    }
  });

  it("runs newest first", () => {
    for (let i = 1; i < RELEASES.length; i++) {
      expect(RELEASES[i - 1].date >= RELEASES[i].date).toBe(true);
    }
  });

  it("shows at most the newest ten", () => {
    const shown = shownReleases();
    expect(shown.length).toBe(Math.min(RELEASES_SHOWN, RELEASES.length));
    expect(shown.length).toBeLessThanOrEqual(10);
    expect(shown).toEqual(RELEASES.slice(0, shown.length));
    expect(shownReleases(RELEASES.slice(0, 3))).toHaveLength(3);
  });
});
