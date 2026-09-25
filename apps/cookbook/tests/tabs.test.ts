import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathFor } from "@/lib/tabs";

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
