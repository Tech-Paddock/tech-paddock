import { describe, expect, it } from "vitest";
import { mayRewriteLine } from "@/lib/lineRewrite";

const today = "2026-11-09";
const line = { item_id: "food", eaten_on: today, deleted_at: null };

describe("mayRewriteLine (TEC-69)", () => {
  it("a correction opened from today's line rewrites that line", () => {
    expect(mayRewriteLine({ kind: "correction", today, line, itemId: "food" })).toBe(true);
  });
  it("an older day's line is never rewritten", () => {
    expect(mayRewriteLine({ kind: "correction", today, line: { ...line, eaten_on: "2026-11-08" }, itemId: "food" })).toBe(false);
  });
  it("a change never rewrites a line", () => {
    expect(mayRewriteLine({ kind: "change", today, line, itemId: "food" })).toBe(false);
  });
  it("a line of another food, a deleted meal or a missing line is left alone", () => {
    expect(mayRewriteLine({ kind: "correction", today, line: { ...line, item_id: "other" }, itemId: "food" })).toBe(false);
    expect(mayRewriteLine({ kind: "correction", today, line: { ...line, deleted_at: "x" }, itemId: "food" })).toBe(false);
    expect(mayRewriteLine({ kind: "correction", today, line: null, itemId: "food" })).toBe(false);
  });
});
