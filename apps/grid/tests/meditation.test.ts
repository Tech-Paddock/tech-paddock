import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { breathAt, BREATH_SECONDS, clock, IN_SECONDS, LENGTHS_MIN, OUT_SECONDS, remainingSeconds } from "@/lib/meditation";
import { nextPromptIndex, PROMPTS } from "@/lib/prompts";

describe("the breath", () => {
  it("is ten seconds: in for four, out for six", () => {
    expect(IN_SECONDS + OUT_SECONDS).toBe(BREATH_SECONDS);
    expect(breathAt(0)).toEqual({ phase: "in", count: 1, word: "Breathe in" });
    expect(breathAt(3)).toMatchObject({ phase: "in", count: 4 });
    expect(breathAt(4)).toMatchObject({ phase: "out", count: 1 });
    expect(breathAt(9)).toMatchObject({ phase: "out", count: 6 });
    expect(breathAt(10)).toMatchObject({ phase: "in", count: 1 });
    expect(breathAt(-5)).toMatchObject({ phase: "in", count: 1 });
  });

  it("the CSS breath is the same length, written only under no-preference", () => {
    const css = readFileSync(resolve(__dirname, "../app/globals.css"), "utf8");
    // The animation lives inside the no-preference block and nowhere else.
    const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}\n/, "");
    expect(outside).not.toMatch(/animation:/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)[\s\S]*animation: grid-breathe 10s/);
    // The text count is hidden only when motion is allowed.
    expect(css).toMatch(/no-preference\) \{[\s\S]*\.grid-count \{\s*display: none;/);
  });
});

describe("the timer", () => {
  it("reads time left from timestamps, so a throttled tab still ends on time", () => {
    expect(remainingSeconds(1000, 60, 1000)).toBe(60);
    expect(remainingSeconds(1000, 60, 31_000)).toBe(30);
    expect(remainingSeconds(1000, 60, 61_000)).toBe(0);
    expect(remainingSeconds(1000, 60, 600_000)).toBe(0);
  });

  it("shows minutes and seconds", () => {
    expect(clock(300)).toBe("5:00");
    expect(clock(61)).toBe("1:01");
    expect(clock(-3)).toBe("0:00");
  });

  it("offers lengths that are each valid to log", () => {
    for (const m of LENGTHS_MIN) expect(m * 60).toBeGreaterThanOrEqual(30);
    expect(Math.max(...LENGTHS_MIN) * 60).toBeLessThanOrEqual(7200);
  });
});

describe("prompts", () => {
  it("are a fixed list in the code, and the next one is never the one just shown", () => {
    expect(PROMPTS.length).toBeGreaterThan(5);
    expect(new Set(PROMPTS).size).toBe(PROMPTS.length);
    for (let i = 0; i < PROMPTS.length; i++) {
      expect(nextPromptIndex(i, () => i / PROMPTS.length)).not.toBe(i);
    }
    expect(nextPromptIndex(null, () => 0.999999)).toBe(PROMPTS.length - 1);
  });
});
