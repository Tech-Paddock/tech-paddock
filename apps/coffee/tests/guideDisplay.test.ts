import { describe, expect, it } from "vitest";
import { guidePresentation } from "@/lib/guideDisplay";
import { GUIDE_FIELDS } from "@/lib/guide";
import type { GuideStatus } from "@/lib/guide";

describe("guidePresentation", () => {
  it("lights the three answers differently", () => {
    expect(guidePresentation("coffee_specific").tone).toBe("found");
    expect(guidePresentation("roaster_generic").tone).toBe("generic");
    expect(guidePresentation("none").tone).toBe("missing");
  });

  it("does not show a search that has not run as a failed one", () => {
    // A bag saved before its search finishes has not failed to find anything.
    // Red there would report a result that does not exist.
    const pending = guidePresentation("not_searched");
    expect(pending.tone).toBe("pending");
    expect(pending.tone).not.toBe("missing");
  });

  it("falls back to pending for a status this file has not caught up with", () => {
    // An unknown answer and a negative answer must not render the same — the
    // trap this app has hit three times in other read paths.
    expect(guidePresentation("something_new" as GuideStatus).tone).toBe("pending");
  });

  it("gives every status a label and an indicator", () => {
    const statuses: GuideStatus[] = ["coffee_specific", "roaster_generic", "none", "not_searched"];
    for (const s of statuses) {
      const p = guidePresentation(s);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.dot).toMatch(/^bg-/);
    }
  });

  it("never words a tier as a claim about who the recipe was written for", () => {
    // The tier records where the instructions were read. "for this coffee",
    // "for this lot" and "bag specific" all assert the part no search checks,
    // and that assertion is what RULES.md §2 exists to keep out of the UI.
    const forbidden = /written for|for this (coffee|lot|bag)|bag[- ]specific/i;
    const statuses: GuideStatus[] = ["coffee_specific", "roaster_generic", "none", "not_searched"];
    for (const s of statuses) {
      expect(guidePresentation(s).label).not.toMatch(forbidden);
    }
  });

  it("keeps presentation out of the validation's vocabulary", () => {
    // guideDisplay must not grow a field name: the moment it does, a label
    // change can start moving a parameter.
    const labels = (["coffee_specific", "roaster_generic", "none", "not_searched"] as GuideStatus[])
      .map((s) => guidePresentation(s).label.toLowerCase());
    for (const field of GUIDE_FIELDS) {
      expect(labels.some((l) => l.includes(field))).toBe(false);
    }
  });
});
