import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * TEC-183: Clark's softer dark mode holds home's contrast floor (apps/home
 * RULES.md, "each token pair holds contrast at or above the lowest any existing
 * livery has for that pair"). Nothing else in the repo checks it. Reads this
 * app's stamped copy of the theme.
 */
const css = readFileSync(resolve(__dirname, "../lib/theme.css"), "utf8");

type Rgb = [number, number, number];

function darkBlock(livery: string): Record<string, Rgb> {
  const m = new RegExp(`\\[data-livery="${livery}"\\]\\[data-mode="dark"\\]\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css);
  if (!m) throw new Error(`no dark block for ${livery}`);
  const out: Record<string, Rgb> = {};
  for (const x of m[1].matchAll(/--([a-z0-9-]+)-rgb:\s*(\d+)\s+(\d+)\s+(\d+);/g)) {
    out[x[1]] = [Number(x[2]), Number(x[3]), Number(x[4])];
  }
  return out;
}

function lum([r, g, b]: Rgb): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const LIVERIES = ["martini", "senna", "mp44", "jps", "mcl39"];
// [foreground, background, floor]: the pairs the app sets type and edges with.
// Type needs 4.5:1; the line is an edge, 3:1.
const PAIRS: [string, string, number][] = [
  ["ink", "paper", 4.5], ["ink", "surface", 4.5], ["ink", "surface-raised", 4.5],
  ["ink-soft", "paper", 4.5], ["ink-soft", "surface", 4.5], ["ink-soft", "surface-raised", 4.5],
  ["accent", "paper", 4.5], ["accent", "surface", 4.5], ["accent", "surface-raised", 4.5],
  ["accent-ink", "accent", 4.5],
  ["danger", "surface", 4.5], ["sev-urgent", "surface", 4.5],
  ["bar-ink", "bar", 4.5],
  ["line", "paper", 3], ["line", "surface", 3],
];
// **Softened on purpose** (the owner: "too dark, hurts my eyes"): body ink is
// less bright than any other livery's, so these three cannot sit at "the lowest
// any other livery has" and are held at the measured numbers instead.
const SOFTENED: Record<string, number> = { "ink/paper": 14.2, "ink/surface": 11.9, "ink/surface-raised": 9.2 };
// Unchanged by this theme edit, so not compared with the others.
const UNCHANGED = new Set(["bar-ink/bar"]);

describe("Clark dark", () => {
  const clark = darkBlock("clark");
  const others = LIVERIES.map(darkBlock);

  it("has the canvas values", () => {
    expect(clark["paper"]).toEqual([0x1a, 0x24, 0x1f]);
    expect(clark["surface"]).toEqual([0x24, 0x32, 0x2a]);
    expect(clark["surface-raised"]).toEqual([0x32, 0x44, 0x39]);
    expect(clark["ink"]).toEqual([0xee, 0xf3, 0xef]);
    expect(clark["ink-soft"]).toEqual([0xb8, 0xc9, 0xbe]);
    expect(clark["accent"]).toEqual([0xf0, 0xce, 0x5c]);
    expect(clark["accent-ink"]).toEqual([0x1a, 0x18, 0x08]);
  });

  it("keeps the bar dark", () => {
    expect(lum(clark["bar"])).toBeLessThan(0.05);
  });

  it.each(PAIRS)("%s on %s clears its absolute floor", (fg, bg, floor) => {
    expect(ratio(clark[fg], clark[bg])).toBeGreaterThanOrEqual(floor);
  });

  it.each(PAIRS.filter(([f, b]) => !(`${f}/${b}` in SOFTENED) && !UNCHANGED.has(`${f}/${b}`)))(
    "%s on %s holds the lowest any other livery has (home RULES)",
    (fg, bg) => {
      const lowest = Math.min(...others.map((o) => ratio(o[fg], o[bg])));
      expect(ratio(clark[fg], clark[bg])).toBeGreaterThanOrEqual(lowest);
    },
  );

  it.each(Object.entries(SOFTENED))("ink pair %s stays at the softened number", (pair, min) => {
    const [fg, bg] = pair.split("/");
    expect(ratio(clark[fg], clark[bg])).toBeGreaterThanOrEqual(min);
  });

  it("measures what the issue says", () => {
    expect(ratio(clark["ink"], clark["surface"])).toBeGreaterThanOrEqual(11.9);
    expect(ratio(clark["ink-soft"], clark["surface"])).toBeGreaterThanOrEqual(7.7);
    expect(ratio(clark["ink-soft"], clark["surface-raised"])).toBeGreaterThanOrEqual(5.9);
    expect(ratio(clark["accent-ink"], clark["accent"])).toBeGreaterThanOrEqual(11.6);
  });

  it("is the same in the media-query block as in the explicit dark block", () => {
    const media = /@media \(prefers-color-scheme: dark\) \{\s*\[data-livery="clark"\]:not\(\[data-mode="light"\]\) \{([\s\S]*?)\n  \}/.exec(css);
    const explicit = /\[data-livery="clark"\]\[data-mode="dark"\]\s*\{([\s\S]*?)\n\}/.exec(css);
    const norm = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
    expect(media).not.toBeNull();
    expect(explicit).not.toBeNull();
    expect(norm(media![1])).toBe(norm(explicit![1]));
  });
});
