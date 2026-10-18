import { describe, expect, it } from "vitest";
import { savedButNotShown } from "@/lib/saved";

// TEC-113: a saved meal that does not render looks like one that failed, and
// gets logged again. After a save the screen checks for its own entry.

const saved = { id: "entry-2", eaten_on: "2026-01-05" };

describe("after a save", () => {
  it("is quiet when the saved entry is on the day read back", () => {
    const day = { date: "2026-01-05", entries: [{ id: "entry-1" }, { id: "entry-2" }] };
    expect(savedButNotShown(saved, day)).toBeNull();
  });

  it("says so when the day read back does not have it — never 'nothing logged'", () => {
    // Exactly the failure: a stale read of the day, empty, after a 201.
    const day = { date: "2026-01-05", entries: [] };
    expect(savedButNotShown(saved, day)).toMatch(/came back without it.*Reload before logging it again/);
  });

  it("says so when the day could not be read back at all", () => {
    expect(savedButNotShown(saved, null, "Couldn't read 2026-01-05: timeout")).toMatch(
      /couldn't be read back \(Couldn't read 2026-01-05: timeout\)/
    );
    expect(savedButNotShown(saved, null)).toMatch(/couldn't be read back/);
  });

  it("names the day when the meal was filed under a different one from the screen's", () => {
    // Dictated before midnight, approved after it: filed under the day it was
    // dictated, so today's list rightly lacks it — said, not silent.
    const day = { date: "2026-01-06", entries: [] };
    expect(savedButNotShown(saved, day)).toMatch(/Logged to 2026-01-05/);
  });
});
