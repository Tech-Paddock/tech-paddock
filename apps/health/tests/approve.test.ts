import { describe, expect, it } from "vitest";
import { decideLine, duplicateFoods, mergeSameFood, type ApprovedLine } from "@/lib/approve";
import { snapshotOf } from "@/lib/log";
import type { ItemVersion } from "@/lib/items";

/**
 * The provenance decision on approve (TEC-30 item 1) and the snapshot a day
 * sums (TEC-21). Invented food only — guardrail 4.
 */

const stored: ItemVersion = {
  id: "v1",
  item_id: "item-fry",
  kcal: 490, protein_g: 6, carbs_g: 66, fat_g: 23,
  kind: "correction",
  effective_from: "2026-09-01",
  source: "estimate",
  model: "claude-haiku-4-5",
  source_url: null,
  note: null,
  created_at: "2026-09-01T12:00:00Z",
};

function line(over: Partial<ApprovedLine> = {}): ApprovedLine {
  return {
    name: "Large fry",
    macros: { kcal: 490, protein_g: 6, carbs_g: 66, fat_g: 23 },
    source: "estimate",
    model: "claude-haiku-4-5",
    source_url: null,
    note: null,
    item_id: "item-fry",
    ...over,
  };
}

describe("decideLine", () => {
  it("snapshots the stored version when the draft is untouched", () => {
    expect(decideLine(line(), "item-fry", stored)).toEqual({ action: "reuse", version: stored });
  });

  it("treats numeric strings from Postgres as the same number", () => {
    const fromDb = { ...stored, kcal: "490.00", protein_g: "6.00" } as unknown as ItemVersion;
    expect(decideLine(line(), "item-fry", fromDb).action).toBe("reuse");
  });

  it("records a hand correction only when the line says it was typed over", () => {
    const typed = line({ macros: { kcal: 420, protein_g: 6, carbs_g: 60, fat_g: 20 }, source: "hand", model: null });
    expect(decideLine(typed, "item-fry", stored)).toEqual({ action: "correct" });
  });

  it("never infers hand from a difference nobody typed", () => {
    const drifted = line({ macros: { kcal: 420, protein_g: 6, carbs_g: 60, fat_g: 20 } });
    expect(decideLine(drifted, "item-fry", stored).action).toBe("reject");
  });

  it("refuses a line renamed onto another food that already exists", () => {
    // Looked up as a new food, then renamed to one the table knows: its numbers
    // are the old food's and must not land as a correction of this one.
    const renamed = line({ name: "Medium fry", item_id: null });
    expect(decideLine(renamed, "item-medium", { ...stored, item_id: "item-medium" }).action).toBe("reject");
  });

  it("refuses a line renamed away from the food it was looked up as", () => {
    // Looked up as a known food, renamed to one the table does not know: its
    // numbers would become the new food's first version under the old label.
    const renamed = line({ name: "Chicken nuggets 8 count", item_id: "item-fry" });
    expect(decideLine(renamed, null, null).action).toBe("reject");
  });

  it("writes a first version with the line's own provenance for a new food", () => {
    const fresh = line({ name: "Chicken nuggets 8 count", item_id: null, source: "web", source_url: "https://example.com/n" });
    expect(decideLine(fresh, null, null)).toEqual({
      action: "first", source: "web", model: "claude-haiku-4-5", source_url: "https://example.com/n", note: null,
    });
  });

  it("a new food typed by hand carries no model and no url", () => {
    const typed = line({ name: "Oat bar", item_id: null, source: "hand", model: null, source_url: "https://example.com" });
    expect(decideLine(typed, null, null)).toEqual({ action: "first", source: "hand", model: null, source_url: null, note: null });
  });

  it("refuses a model-sourced first version with no model", () => {
    expect(decideLine(line({ name: "Oat bar", item_id: null, model: null }), null, null).action).toBe("reject");
  });
});

describe("duplicateFoods", () => {
  it("finds lines that normalise to one food", () => {
    expect(duplicateFoods(["Large fry", "Diet cola", "large  fry!"])).toEqual(["large  fry!"]);
    expect(duplicateFoods(["Large fry", "Medium fry"])).toEqual([]);
  });
});

describe("mergeSameFood", () => {
  it("adds quantities for a food said twice and keeps the first spelling", () => {
    expect(mergeSameFood([
      { name: "Plain bagel", quantity: 1 },
      { name: "Diet cola", quantity: 1 },
      { name: "plain bagel", quantity: 2 },
    ])).toEqual([
      { name: "Plain bagel", quantity: 3 },
      { name: "Diet cola", quantity: 1 },
    ]);
  });
});

describe("snapshotOf", () => {
  it("reads the logged numbers, which is all a day's total sums", () => {
    expect(snapshotOf({ item_version_id: "v1", kcal: "490.00", protein_g: "6.00", carbs_g: 66, fat_g: 23 }))
      .toEqual({ kcal: 490, protein_g: 6, carbs_g: 66, fat_g: 23 });
  });

  it("is null, never zero, for a line missing its numbers, which readDay refuses", () => {
    expect(snapshotOf({ item_version_id: null, kcal: null, protein_g: null, carbs_g: null, fat_g: null })).toBeNull();
  });
});
