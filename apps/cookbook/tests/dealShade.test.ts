import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TEC-196: a shaded Grocery list line is the Deals board's accent (good) or
 * danger (bad) at a faint wash over the row's own ground. Colour is never the
 * only cue, but the words on it must still read: every text colour the row
 * uses holds 4.5:1 on the wash, in Clark light and dark, over each ground a row
 * sits on. The wash is `WASH`, and `app/List.tsx` must use that same number.
 */
const WASH = 0.08;

const css = readFileSync(resolve(__dirname, "../lib/theme.css"), "utf8");
const list = readFileSync(resolve(__dirname, "../app/List.tsx"), "utf8");

type Rgb = [number, number, number];

function tokens(selector: string): Record<string, Rgb> {
  const at = css.indexOf(selector);
  if (at < 0) throw new Error(`no block ${selector}`);
  const body = css.slice(at, css.indexOf("\n}", at));
  const out: Record<string, Rgb> = {};
  for (const x of body.matchAll(/--([a-z0-9-]+)-rgb:\s*(\d+)\s+(\d+)\s+(\d+);/g)) out[x[1]] = [Number(x[2]), Number(x[3]), Number(x[4])];
  return out;
}

const lum = ([r, g, b]: Rgb) => {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const wash = (tint: Rgb, ground: Rgb): Rgb => tint.map((v, i) => Math.round(v * WASH + ground[i] * (1 - WASH))) as Rgb;

describe("a shaded line's wash", () => {
  it("List.tsx uses the same wash this test measures", () => {
    expect(list).toMatch(new RegExp(`from-accent/\\[${WASH}\\] to-accent/\\[${WASH}\\]`));
    expect(list).toMatch(new RegExp(`from-danger/\\[${WASH}\\] to-danger/\\[${WASH}\\]`));
  });

  for (const [mode, selector] of [
    ["light", '[data-livery="clark"] {'],
    ["dark", '[data-livery="clark"][data-mode="dark"] {'],
  ] as const) {
    it(`holds 4.5:1 for ink, soft ink and its own tint in Clark ${mode}`, () => {
      const t = tokens(selector);
      for (const tint of ["accent", "danger"]) {
        for (const ground of ["paper", "surface", "surface-raised"]) {
          const bg = wash(t[tint], t[ground]);
          for (const fg of ["ink", "ink-soft", tint]) {
            expect(ratio(t[fg], bg), `${fg} on ${tint} wash over ${ground}, ${mode}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    });
  }
});
