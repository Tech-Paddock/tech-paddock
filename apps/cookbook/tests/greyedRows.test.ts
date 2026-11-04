import { describe, expect, it } from "vitest";
import {
  GREY_TTL_MS,
  greyKey,
  isExpired,
  isGreyed,
  readGreyed,
  toggleGreyed,
  writeGreyed,
} from "@/lib/greyedRows";

const T0 = 1_800_000_000_000;

describe("greyed rows (TEC-222)", () => {
  it("expires at exactly 24 hours after the last tap, not a millisecond before", () => {
    expect(GREY_TTL_MS).toBe(86_400_000);
    expect(isExpired(T0, T0 + GREY_TTL_MS - 1)).toBe(false);
    expect(isExpired(T0, T0 + GREY_TTL_MS)).toBe(true);
    const raw = JSON.stringify({ at: T0, ingredients: [1], steps: [] });
    expect(readGreyed(raw, T0 + GREY_TTL_MS - 1)).not.toBeNull();
    expect(readGreyed(raw, T0 + GREY_TTL_MS)).toBeNull();
  });

  it("toggles a row on and off, per kind", () => {
    const on = toggleGreyed(null, "ingredient", 2, T0);
    expect(isGreyed(on, "ingredient", 2)).toBe(true);
    expect(isGreyed(on, "step", 2)).toBe(false);
    const step = toggleGreyed(on, "step", 0, T0 + 10);
    expect(step.ingredients).toEqual([2]);
    expect(step.steps).toEqual([0]);
    const off = toggleGreyed(step, "ingredient", 2, T0 + 20);
    expect(isGreyed(off, "ingredient", 2)).toBe(false);
    expect(off.steps).toEqual([0]);
  });

  it("each tap resets the 24 hours", () => {
    const first = toggleGreyed(null, "step", 1, T0);
    const second = toggleGreyed(first, "step", 2, T0 + GREY_TTL_MS - 5);
    expect(second.at).toBe(T0 + GREY_TTL_MS - 5);
    expect(readGreyed(writeGreyed(second), T0 + GREY_TTL_MS + 1000)).not.toBeNull();
  });

  it("a tap after expiry starts fresh instead of reviving old rows", () => {
    const old = toggleGreyed(null, "ingredient", 0, T0);
    const fresh = toggleGreyed(old, "step", 3, T0 + GREY_TTL_MS);
    expect(fresh.ingredients).toEqual([]);
    expect(fresh.steps).toEqual([3]);
  });

  it("round-trips, and stores nothing when nothing is greyed", () => {
    const state = toggleGreyed(toggleGreyed(null, "ingredient", 4, T0), "step", 1, T0 + 1);
    expect(readGreyed(writeGreyed(state), T0 + 2)).toEqual(state);
    const empty = toggleGreyed(toggleGreyed(null, "step", 1, T0), "step", 1, T0 + 1);
    expect(writeGreyed(empty)).toBeNull();
  });

  it("ignores missing or malformed storage", () => {
    const bad = [
      null,
      undefined,
      "",
      "not json",
      "null",
      "[]",
      "{}",
      '{"at":"x","ingredients":[],"steps":[]}',
      JSON.stringify({ at: T0, ingredients: [-1], steps: [] }),
      JSON.stringify({ at: T0, ingredients: "a", steps: [] }),
      JSON.stringify({ at: T0, ingredients: [], steps: [] }),
    ];
    for (const raw of bad) expect(readGreyed(raw, T0 + 1)).toBeNull();
  });

  it("keys by recipe", () => {
    expect(greyKey("abc")).not.toBe(greyKey("abd"));
  });
});
