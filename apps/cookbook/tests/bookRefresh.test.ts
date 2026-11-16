import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { readBook } from "@/lib/bookRead";
import { ClearSearchButton, RefreshButton } from "@/app/Book";

/**
 * Refresh and the search ×, on the Recipes tab (TEC-273, TEC-274). The read is
 * one function with `fetch` injected; the controls are drawn to static markup.
 */

function reply(ok: boolean, body: unknown): typeof fetch {
  return vi.fn(async () => ({ ok, json: async () => body }) as Response) as unknown as typeof fetch;
}

describe("reading the book", () => {
  it("a refresh that succeeds hands back the list, read with no-store", async () => {
    const f = reply(true, { recipes: [{ id: "a" }, { id: "b" }] });
    const read = await readBook(f);
    expect(read).toEqual({ ok: true, recipes: [{ id: "a" }, { id: "b" }] });
    expect(f).toHaveBeenCalledWith("/api/recipes", { cache: "no-store" });
  });

  it("a book that really is empty is an empty list, not a failure", async () => {
    expect(await readBook(reply(true, { recipes: [] }))).toEqual({ ok: true, recipes: [] });
  });

  it("a refused read is a failure with the server's words, and no list", async () => {
    const read = await readBook(reply(false, { error: "Database is down." }));
    expect(read).toEqual({ ok: false, error: "Database is down." });
  });

  it("a network failure is a failure, never an empty book", async () => {
    const f = vi.fn(async () => {
      throw new Error("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await readBook(f)).toEqual({ ok: false, error: "Failed to fetch" });
  });

  it("a reply that is not a list is a failure, never an empty book", async () => {
    expect(await readBook(reply(true, {}))).toEqual({ ok: false, error: "Couldn't read the book." });
    expect(await readBook(reply(false, null))).toEqual({ ok: false, error: "Couldn't read the book." });
  });
});

describe("the controls", () => {
  it("Refresh says Refresh, and is busy and inert while it runs", () => {
    const idle = renderToStaticMarkup(createElement(RefreshButton, { refreshing: false, onRefresh: () => undefined }));
    expect(idle).toContain("Refresh");
    expect(idle).not.toContain('disabled=""');
    const busy = renderToStaticMarkup(createElement(RefreshButton, { refreshing: true, onRefresh: () => undefined }));
    expect(busy).toContain("Refreshing…");
    expect(busy).toContain('disabled=""');
    expect(busy).toContain('aria-busy="true"');
  });

  it("the × is named Clear search and is 40px to tap", () => {
    const html = renderToStaticMarkup(createElement(ClearSearchButton, { onClear: () => undefined }));
    expect(html).toContain('aria-label="Clear search"');
    expect(html).toContain('type="button"');
    expect(html).toContain("size-10");
  });
});

describe("how the Book wires them", () => {
  const book = readFileSync(resolve(__dirname, "../app/Book.tsx"), "utf8");

  it("shows the × only when the field has text, and puts focus back in the box", () => {
    expect(book).toMatch(/\{query \? \(\s*<ClearSearchButton/);
    expect(book).toMatch(/setQuery\(""\);\s*searchRef\.current\?\.focus\(\);/);
  });

  it("hides Chrome's own clear button so only one × shows", () => {
    expect(book).toContain("[&::-webkit-search-cancel-button]:appearance-none");
  });

  it("keeps the list on screen when a read fails, and says so", () => {
    expect(book).toContain("Showing the list as it was.");
    expect(book).not.toMatch(/setRecipes\(\[\]\)/);
  });

  it("ignores a second tap while a refresh runs", () => {
    expect(book).toMatch(/if \(refreshingRef\.current\) return;/);
  });
});
