import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { typedLines } from "@/lib/typedLines";

/**
 * The list's add box keeps multi-line paste (owner, 2026-10-23): a paste of
 * several lines adds one item per line. The database is mocked.
 */

const added: { name: string; note: string | null }[][] = [];

vi.mock("@/lib/grocery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/grocery")>()),
  addItems: async (lines: { name: string; note: string | null }[]) => {
    added.push(lines);
    return lines.map((l, i) => ({ id: `i${i}`, ...l }));
  },
}));
vi.mock("@/lib/lineQuantity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/lineQuantity")>()),
  quantityRule: async () => () => 1,
}));

const PASTE = "Test milk\r\n  test eggs — the big box  \n\ntest bread\n";

describe("pasting several lines into the add box", () => {
  it("reads one item per line, dropping blanks", () => {
    expect(typedLines(PASTE)).toEqual(["Test milk", "test eggs — the big box", "test bread"]);
  });

  it("adds three items for a paste of three lines", async () => {
    const { POST } = await import("@/app/api/grocery/route");
    const response = await POST(
      new NextRequest("http://localhost/api/grocery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: typedLines(PASTE) }),
      })
    );
    expect(response.status).toBe(201);
    expect((await response.json()).items).toHaveLength(3);
    expect(added.at(-1)).toMatchObject([
      { name: "Test milk", note: null },
      { name: "test eggs", note: "the big box" },
      { name: "test bread", note: null },
    ]);
  });
});
