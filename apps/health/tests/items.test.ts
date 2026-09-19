import { describe, expect, it } from "vitest";
import { normalizeName, resolveVersion, eraFor, type ItemVersion } from "@/lib/items";

/**
 * The resolution rule is the one decision in this app that gets expensive the
 * moment there are rows, so it is tested rather than reasoned about.
 *
 * The rule (issue #116): take the era with the greatest `effective_from` on or
 * before the day, then within that era the most recently written row. A
 * correction carries the era it corrects and so reaches backwards; a change
 * carries its own date and so does not.
 */

let seq = 0;
function version(over: Partial<ItemVersion> & { effective_from: string }): ItemVersion {
  seq += 1;
  return {
    id: `v${seq}`,
    item_id: "item",
    kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 10,
    kind: "correction",
    source: "estimate",
    model: "claude-haiku-4-5",
    source_url: null,
    note: null,
    // Distinct and increasing unless a test says otherwise, so "most recently
    // written" is unambiguous.
    created_at: `2026-01-01T00:00:${String(seq).padStart(2, "0")}Z`,
    ...over,
  } as ItemVersion;
}

describe("resolveVersion", () => {
  it("returns null only when there are no versions at all", () => {
    expect(resolveVersion([], "2026-09-19")).toBeNull();
  });

  it("a correction reaches backwards through its era", () => {
    const first = version({ effective_from: "2026-09-01", kcal: 600 });
    const fix = version({ effective_from: "2026-09-01", kcal: 540, kind: "correction", source: "hand", model: null });

    // A day logged before the correction was written still resolves to it:
    // the number was always wrong and is now right, backwards.
    expect(resolveVersion([first, fix], "2026-09-05")?.kcal).toBe(540);
    expect(resolveVersion([first, fix], "2026-09-01")?.kcal).toBe(540);
  });

  it("a change does not reach backwards", () => {
    const old = version({ effective_from: "2026-09-01", kcal: 600 });
    const reformulated = version({ effective_from: "2026-09-10", kcal: 720, kind: "change" });

    // Tuesday really did have the old macros. Resolving it forward would
    // falsify it rather than correct it.
    expect(resolveVersion([old, reformulated], "2026-09-05")?.kcal).toBe(600);
    expect(resolveVersion([old, reformulated], "2026-09-10")?.kcal).toBe(720);
    expect(resolveVersion([old, reformulated], "2026-09-19")?.kcal).toBe(720);
  });

  it("a correction to the current era leaves an earlier era alone", () => {
    const old = version({ effective_from: "2026-09-01", kcal: 600 });
    const changed = version({ effective_from: "2026-09-10", kcal: 720, kind: "change" });
    const fix = version({ effective_from: "2026-09-10", kcal: 690, kind: "correction", source: "hand", model: null });

    expect(resolveVersion([old, changed, fix], "2026-09-05")?.kcal).toBe(600);
    expect(resolveVersion([old, changed, fix], "2026-09-12")?.kcal).toBe(690);
  });

  it("falls back to the earliest version for a day before any era starts", () => {
    // A null here would render as a silently missing total, which is the
    // failure mode this app is least allowed to have.
    const only = version({ effective_from: "2026-09-10", kcal: 300 });
    expect(resolveVersion([only], "2026-09-01")?.kcal).toBe(300);
  });

  it("is independent of the order the versions arrive in", () => {
    const old = version({ effective_from: "2026-09-01", kcal: 600 });
    const changed = version({ effective_from: "2026-09-10", kcal: 720, kind: "change" });
    const shuffled = [changed, old];
    expect(resolveVersion(shuffled, "2026-09-05")?.kcal).toBe(600);
    expect(resolveVersion(shuffled, "2026-09-19")?.kcal).toBe(720);
  });

  it("breaks a same-era tie on which was written last, not which was passed first", () => {
    const earlier = version({ effective_from: "2026-09-01", kcal: 600, created_at: "2026-09-01T10:00:00Z" });
    const later = version({ effective_from: "2026-09-01", kcal: 500, created_at: "2026-09-02T10:00:00Z" });
    expect(resolveVersion([later, earlier], "2026-09-05")?.kcal).toBe(500);
  });
});

describe("eraFor", () => {
  it("puts an incoming correction in the era in effect on that day", () => {
    const old = version({ effective_from: "2026-09-01" });
    const changed = version({ effective_from: "2026-09-10", kind: "change" });
    expect(eraFor([old, changed], "2026-09-05")).toBe("2026-09-01");
    expect(eraFor([old, changed], "2026-09-12")).toBe("2026-09-10");
  });

  it("uses the day itself when the food has no versions yet", () => {
    expect(eraFor([], "2026-09-19")).toBe("2026-09-19");
  });
});

describe("normalizeName", () => {
  it("folds the several ways of writing a combo number", () => {
    const expected = "chick fil a number 1";
    expect(normalizeName("Chick-fil-A #1")).toBe(expected);
    expect(normalizeName("chick fil a number one")).toBe(expected);
    expect(normalizeName("Chick-Fil-A  No. 1")).toBe(expected);
  });

  it("keeps a size in the name, because the name carries the specification", () => {
    expect(normalizeName("Large Fry")).not.toBe(normalizeName("Medium Fry"));
  });

  it("does not expand an abbreviation it cannot be sure of", () => {
    // Guessing "CFA" is "Chick-fil-A" would silently merge two foods into one
    // row, which is worse than a duplicate.
    expect(normalizeName("CFA #1")).not.toBe(normalizeName("Chick-fil-A #1"));
  });

  it("folds punctuation, case and spacing", () => {
    expect(normalizeName("  Ben & Jerry's   Half-Baked ")).toBe("ben and jerry s half baked");
  });
});
