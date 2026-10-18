import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TABS, pathFor } from "@/lib/tabs";

/**
 * **Another app depends on one of these addresses.** Health's `/list` redirects
 * to `https://cookbook.techpaddock.io/list` (TEC-15), so the list's path and the
 * route that serves it are held here rather than trusted.
 */
describe("the tabs' addresses", () => {
  it("the list lives at /list — the path Health's redirect names", () => {
    expect(pathFor("shop")).toBe("/list");
  });

  it("the book lives at the root", () => {
    expect(pathFor("recipes")).toBe("/");
  });

  it("a route exists at /list and it opens on the list, not the book", () => {
    const page = resolve(__dirname, "../app/list/page.tsx");
    expect(existsSync(page)).toBe(true);
    expect(readFileSync(page, "utf8")).toMatch(/<Shell tab="shop" \/>/);
  });
});

describe("the Add tab (Joel, 2026-10-05)", () => {
  it("sits between the book and the list, at /add", () => {
    expect(TABS.map((t) => t.label)).toEqual(["Recipes", "Add", "King Soopers list"]);
    expect(pathFor("add")).toBe("/add");
  });

  it("has a route that opens on it", () => {
    const page = resolve(__dirname, "../app/add/page.tsx");
    expect(existsSync(page)).toBe(true);
    expect(readFileSync(page, "utf8")).toMatch(/<Shell tab="add" \/>/);
  });
});

describe("the home-screen icon (Joel, 2026-10-05)", () => {
  const layout = readFileSync(resolve(__dirname, "../app/layout.tsx"), "utf8");

  it("is a static import, so iOS fetches it past the password gate", () => {
    expect(layout).toMatch(/import appleTouchIcon from "\.\/apple-touch-icon\.png"/);
    expect(existsSync(resolve(__dirname, "../app/apple-touch-icon.png"))).toBe(true);
    expect(layout).toMatch(/apple: \[\{ url: appleTouchIcon\.src/);
  });
});
