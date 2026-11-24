import { describe, expect, it } from "vitest";
import { MIN_BOUGHT_SLICE, NIGHT_CODE_BUDGET, dayNumber, rotationNights, tonightsBought } from "@/lib/scanRotation";

const codes = (n: number) => Array.from({ length: n }, (_, i) => String(2000000000000 + i));

describe("the bought-product rotation (paddock-issues#77)", () => {
  it("is one night when everything fits", () => {
    expect(rotationNights(409, 32)).toBe(1);
    expect(tonightsBought(codes(32), 409, "2026-11-24")).toMatchObject({ nights: 1 });
    expect(tonightsBought(codes(32), 409, "2026-11-24").codes).toHaveLength(32);
  });

  it("gives the bought codes what the saved ones leave, never less than the minimum", () => {
    expect(rotationNights(409, NIGHT_CODE_BUDGET - 409)).toBe(1);
    expect(rotationNights(409, NIGHT_CODE_BUDGET - 409 + 1)).toBe(2);
    expect(rotationNights(5000, MIN_BOUGHT_SLICE + 1)).toBe(2);
  });

  it("every code is looked up exactly once in each full pass, in a fixed order", () => {
    const all = codes(2500);
    const nights = rotationNights(409, all.length);
    expect(nights).toBe(5);
    const start = dayNumber("2026-11-24");
    const seen = new Map<string, number>();
    for (let d = 0; d < nights; d++) {
      const date = new Date((start + d) * 86_400_000).toISOString().slice(0, 10);
      for (const c of tonightsBought(all, 409, date).codes) seen.set(c, (seen.get(c) ?? 0) + 1);
    }
    expect(all.every((c) => seen.get(c) === 1)).toBe(true);
  });

  it("repeats: the same night always takes the same slice, whatever order the codes arrive in", () => {
    const all = codes(2500);
    const a = tonightsBought(all, 409, "2026-11-24").codes;
    const b = tonightsBought([...all].reverse(), 409, "2026-11-24").codes;
    expect(b).toEqual(a);
    expect(a).toEqual([...a].sort());
  });

  it("counts a repeated code once", () => {
    expect(tonightsBought(["2000000000001", "2000000000001"], 0, "2026-11-24").codes).toEqual(["2000000000001"]);
  });
});
