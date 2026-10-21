import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroceryItem } from "@/lib/grocery";

/**
 * A Tidy keeps what was sent (TEC-127). It replaces merged lines with new rows;
 * without moving their cart sends first, a sent line could never be taken
 * back. The database is a fake that records calls, in order.
 */

const db = vi.hoisted(() => ({ calls: [] as string[], moves: [] as { from: string[]; to: string }[] }));

vi.mock("@/lib/cartSends", () => ({
  moveSends: async (from: string[], to: string) => {
    db.calls.push("move");
    db.moves.push({ from, to });
  },
}));

vi.mock("@/lib/supabase", () => ({
  getServiceClient: () => ({
    from: () => ({
      insert: (rows: { name: string }[]) => ({
        select: async () => {
          db.calls.push("insert");
          return { data: rows.map((r, i) => ({ ...r, id: `new-${i}`, checked: false, created_at: "", quantity: 1 })), error: null };
        },
      }),
      delete: () => ({
        in: async () => {
          db.calls.push("delete");
          return { error: null };
        },
      }),
    }),
  }),
}));

function line(id: string, name: string, sent_at: string | null = null): GroceryItem {
  return { id, name, note: null, source: "manual", checked: false, created_at: "", recipes: [], quantity: 1, sent_at };
}

beforeEach(() => {
  db.calls = [];
  db.moves = [];
});

describe("a Tidy and what was sent", () => {
  it("moves each merged line's sends onto the new line before the old ones are deleted", async () => {
    const { applyTidy } = await import("@/lib/grocery");
    const open = [line("a", "milk", "2026-10-21T01:00:00Z"), line("b", "Milk"), line("c", "eggs")];
    await applyTidy(open, [
      { name: "milk", note: null, absorbed: ["a", "b"] },
      { name: "eggs", note: null, absorbed: ["c"] },
    ]);
    expect(db.moves).toEqual([
      { from: ["a", "b"], to: "new-0" },
      { from: ["c"], to: "new-1" },
    ]);
    expect(db.calls.indexOf("delete")).toBeGreaterThan(db.calls.lastIndexOf("move"));
  });
});
