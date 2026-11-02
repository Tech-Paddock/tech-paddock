import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { typedLines } from "@/lib/typedLines";

/**
 * TEC-212: the list's Add box is its own card so it does not get lost. There is no DOM
 * harness here, so the screen is read as source (as noPopups.test.ts does). Behaviour
 * (Enter adds, Shift+Enter starts a line, a paste adds one per line) is unchanged.
 */

const list = readFileSync(resolve(__dirname, "../app/List.tsx"), "utf8");
const start = list.indexOf('<section aria-label="Add to the list"');
const card = list.slice(start, list.indexOf("</section>", start));

describe("the Add box card (TEC-212)", () => {
  it("is a 2px accent frame with a bold heading and a plus", () => {
    expect(start).toBeGreaterThan(-1);
    expect(card).toMatch(/border-2 border-accent/);
    expect(card).toMatch(/<h2 className="[^"]*font-bold[^"]*">Add to the list<\/h2>/);
    expect(card).toContain("＋");
  });

  it("sits below the filters and above the lines", () => {
    expect(start).toBeGreaterThan(list.indexOf("Clear ticked"));
    expect(start).toBeLessThan(list.indexOf("<ListRow"));
  });

  it("has a placeholder in ink, not faded", () => {
    expect(card).toContain('placeholder="Eggs, 2 lb chicken — notes after a dash"');
    expect(card).toMatch(/placeholder:text-ink(?![-/\w])/);
    expect(card).not.toMatch(/placeholder:[^" ]*(opacity|ink-soft)/);
  });

  it("keeps the Add button full accent, never faded, and it does nothing when empty", () => {
    const button = card.slice(card.indexOf("<button"), card.indexOf("</button>"));
    expect(button).toMatch(/bg-accent/);
    expect(button).not.toMatch(/opacity|\sdisabled=/);
    expect(button).toMatch(/aria-disabled/);
    // add() returns before any request when nothing is typed.
    expect(list).toMatch(/if \(lines\.length === 0 \|\| busy\) return;/);
    expect(typedLines("   \n  ")).toEqual([]);
  });

  it("keeps Enter adding and Shift+Enter starting a line", () => {
    expect(card).toMatch(/e\.key === "Enter" && !e\.shiftKey/);
  });

  it("cannot scroll sideways at phone width: the box shrinks, the plus and button do not", () => {
    expect(card).toMatch(/min-w-0 flex-1/);
    expect(card).toMatch(/shrink-0 self-start whitespace-nowrap/);
  });

  it("uses existing tokens only", () => {
    const colours = card.match(/(?:bg|border|placeholder:text)-[a-z-]+|(?<![:\w])text-(?:ink|accent|accent-ink|ink-soft|danger|line|surface)\b/g) ?? [];
    const allowed = new Set(["bg-surface", "bg-accent", "bg-transparent", "text-ink", "text-accent", "text-accent-ink", "border-accent", "border-2", "placeholder:text-ink"]);
    for (const c of colours) expect(allowed.has(c), c).toBe(true);
  });
});
