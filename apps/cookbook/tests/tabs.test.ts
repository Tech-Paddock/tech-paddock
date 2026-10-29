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

describe("the tab order and names (TEC-189)", () => {
  it("is Recipes, Grocery list, Deals, Add, Your brands", () => {
    expect(TABS.map((t) => t.label)).toEqual(["Recipes", "Grocery list", "Deals", "Add", "Your brands"]);
  });

  it("the list tab is renamed but keeps /list, and its heading says the same", () => {
    expect(TABS.find((t) => t.id === "shop")?.label).toBe("Grocery list");
    expect(pathFor("shop")).toBe("/list");
    expect(readFileSync(resolve(__dirname, "../app/List.tsx"), "utf8")).toMatch(/<h2 className="text-xl font-bold">Grocery list<\/h2>/);
  });
});

describe("the Add tab (2026-10-05)", () => {
  it("is at /add", () => {
    expect(pathFor("add")).toBe("/add");
  });

  it("has a route that opens on it", () => {
    const page = resolve(__dirname, "../app/add/page.tsx");
    expect(existsSync(page)).toBe(true);
    expect(readFileSync(page, "utf8")).toMatch(/<Shell tab="add" \/>/);
  });
});

describe("Your brands, its own tab (TEC-131)", () => {
  it("is the last tab, at /brands, and the list keeps /list", () => {
    expect(TABS[TABS.length - 1].label).toBe("Your brands");
    expect(pathFor("brands")).toBe("/brands");
    expect(pathFor("shop")).toBe("/list");
  });

  it("has a route that opens on it, and has left the list page", () => {
    const page = resolve(__dirname, "../app/brands/page.tsx");
    expect(existsSync(page)).toBe(true);
    expect(readFileSync(page, "utf8")).toMatch(/<Shell tab="brands" \/>/);
    expect(readFileSync(resolve(__dirname, "../app/List.tsx"), "utf8")).not.toMatch(/<Brands/);
  });
});

describe("Deals, its own tab (TEC-132)", () => {
  it("comes right after the Grocery list, at /deals, and /list is unchanged", () => {
    const labels = TABS.map((t) => t.label);
    expect(labels[labels.indexOf("Grocery list") + 1]).toBe("Deals");
    expect(pathFor("deals")).toBe("/deals");
    expect(pathFor("shop")).toBe("/list");
  });

  it("has a route that opens on it", () => {
    const page = resolve(__dirname, "../app/deals/page.tsx");
    expect(existsSync(page)).toBe(true);
    expect(readFileSync(page, "utf8")).toMatch(/<Shell tab="deals" \/>/);
  });
});

describe("the home-screen icon (2026-10-05)", () => {
  const layout = readFileSync(resolve(__dirname, "../app/layout.tsx"), "utf8");

  it("is a static import, so iOS fetches it past the password gate", () => {
    expect(layout).toMatch(/import appleTouchIcon from "\.\/apple-touch-icon\.png"/);
    expect(existsSync(resolve(__dirname, "../app/apple-touch-icon.png"))).toBe(true);
    expect(layout).toMatch(/apple: \[\{ url: appleTouchIcon\.src/);
  });
});
