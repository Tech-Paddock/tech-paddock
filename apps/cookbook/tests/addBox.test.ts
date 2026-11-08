import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { typedLines } from "@/lib/typedLines";

/**
 * TEC-236 (replaces TEC-212's bordered Add card): the list's Add box and the book's search box are
 * one rounded field with the icon inside and an accent ring on focus. There is no DOM harness
 * here, so the screens are read as source (as noPopups.test.ts does). Behaviour (Enter adds,
 * Shift+Enter starts a line, a paste adds one per line) is unchanged.
 */

const read = (f: string) => readFileSync(resolve(__dirname, f), "utf8");
const list = read("../app/List.tsx");
const field = read("../app/SearchField.tsx");
const book = read("../app/Book.tsx");
const css = read("../app/globals.css");

const start = list.indexOf('<SearchField icon="add"');
const add = list.slice(start, list.indexOf("</SearchField>", start));

describe("the shared search / add field", () => {
  it("is a rounded field with the icon inside and the accent as its focus colour", () => {
    expect(field).toMatch(/rounded-\[26px\]/);
    expect(field).toMatch(/focus-within:border-accent/);
    expect(field).toContain("field-shadow");
    expect(css).toMatch(/\.field-shadow:focus-within\s*\{[^}]*--accent-rgb/);
    // A plus for add, a magnifier for search.
    expect(field).toContain("M12 5v14M5 12h14");
    expect(field).toContain("<circle");
  });

  it("uses existing tokens only", () => {
    const colours = (field + css).match(/(?:bg|border|text|placeholder:text)-(?:surface|accent|ink|ink-soft|line|raised|danger|paper)\b/g) ?? [];
    expect(colours.length).toBeGreaterThan(0);
    expect(field + css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("the book's search is the same field, with the magnifier, and keeps its label", () => {
    expect(book).toContain('<SearchField icon="search">');
    expect(book).toContain('aria-label="Search recipes"');
    expect(book).not.toMatch(/min-h-10 rounded-xl border border-line bg-surface px-3\.5/);
  });
});

describe("the List's Add field", () => {
  it("replaces the bordered Add card: no 2px frame and no heading", () => {
    expect(start).toBeGreaterThan(-1);
    expect(list).not.toMatch(/border-2 border-accent bg-surface p-3/);
    expect(list).not.toContain('<h2 className="mb-1 text-sm font-bold text-ink">Add to the list</h2>');
    expect(list).toContain('label="Add to the list"');
  });

  it("sits below the filters and above the lines", () => {
    expect(start).toBeGreaterThan(list.indexOf("Clear ticked"));
    expect(start).toBeLessThan(list.indexOf("<ListRow"));
  });

  it("keeps the placeholder and the Add button full accent, never faded, doing nothing when empty", () => {
    expect(add).toContain('placeholder="Eggs, 2 lb chicken — notes after a dash"');
    const button = add.slice(add.indexOf("<button"), add.indexOf("</button>"));
    expect(button).toMatch(/bg-accent/);
    expect(button).not.toMatch(/opacity|\sdisabled=/);
    expect(button).toMatch(/aria-disabled/);
    // add() returns before any request when nothing is typed.
    expect(list).toMatch(/if \(lines\.length === 0 \|\| busy\) return;/);
    expect(typedLines("   \n  ")).toEqual([]);
  });

  it("keeps Enter adding and Shift+Enter starting a line", () => {
    expect(add).toMatch(/e\.key === "Enter" && !e\.shiftKey/);
  });

  it("cannot scroll sideways at phone width: the box shrinks, the button does not", () => {
    expect(field).toMatch(/min-w-0 flex-1/);
    expect(add).toMatch(/shrink-0 self-start whitespace-nowrap/);
  });
});

describe("primary buttons pop (TEC-236)", () => {
  it("the lift is a highlight and an accent-coloured shadow, and the filled buttons use it", () => {
    expect(css).toMatch(/\.lift\s*\{[^}]*inset[^}]*--accent-rgb/);
    for (const needle of ["lift min-h-10 shrink-0 self-start", "lift h-7 shrink-0", "lift flex min-h-12"]) expect(list).toContain(needle);
    expect(read("../app/RecipeDetail.tsx")).toContain("lift min-h-11 shrink-0");
    expect(read("../app/Cookbook.tsx")).toContain('"lift bg-accent font-semibold text-accent-ink"');
  });
});
