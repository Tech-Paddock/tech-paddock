import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

/**
 * Import purchases (TEC-213): the store is insert only and a re-paste adds
 * nothing; the route is signed in like every `/api` route. The client is a recorder.
 */

const db = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; rows?: Record<string, unknown>[]; options?: Record<string, unknown> }[],
  seen: new Set<string>(),
  reads: [] as { filters: [string, string, unknown][] }[],
  pages: [] as unknown[][],
}));

vi.mock("@/lib/productStore", () => ({
  readProducts: async () => [{ id: "p1", product_id: "0001111000001", description: "Test Brand Oat Milk" }],
}));

vi.mock("@/lib/supabase", () => ({
  getServiceClient: () => ({
    from: (table: string) => ({
      // The unique key (order_ref, line_key) with ignoreDuplicates: only new rows come back.
      upsert: (rows: Record<string, unknown>[], options: Record<string, unknown>) => {
        db.calls.push({ table, op: "upsert", rows, options });
        const added = rows.filter((r) => {
          const k = `${r.order_ref}|${r.line_key}`;
          if (db.seen.has(k)) return false;
          db.seen.add(k);
          return true;
        });
        return { select: async () => ({ data: added.map((r) => ({ product_id: r.product_id })), error: null }) };
      },
      select: () => {
        const read = { filters: [] as [string, string, unknown][] };
        db.reads.push(read);
        const chain: Record<string, unknown> = {};
        for (const op of ["not", "gte", "lte"]) {
          chain[op] = (col: string, a: unknown, b?: unknown) => {
            read.filters.push([op, col, b ?? a]);
            return chain;
          };
        }
        chain.order = () => chain;
        chain.range = async () => ({ data: db.pages.shift() ?? [], error: null });
        return chain;
      },
    }),
  }),
}));

import { importPurchases, purchasesPerProduct } from "@/lib/purchaseStore";
import { POST } from "@/app/api/purchases/route";

const line = (o: Record<string, unknown> = {}) =>
  JSON.stringify({ ordered_on: "2026-10-30", order_ref: "A-1", description: "Test Brand Oat Milk", quantity: 1, ...o });

beforeEach(() => {
  db.calls.length = 0;
  db.seen.clear();
  db.reads.length = 0;
  db.pages.length = 0;
});

describe("importPurchases", () => {
  const paste = [line({ upc: "0001111000001" }), line({ description: "Unknown Thing" }), "garbage", line({ order_ref: "A-2", description: "Other" })].join("\n");

  it("writes with ignoreDuplicates on the unique key and reports the one line", async () => {
    const r = await importPurchases(paste);
    expect(r).toMatchObject({ imported: 3, orders: 2, matched: 1, skipped: 1 });
    expect(r.line).toBe("Imported 3 from 2 orders · 1 matched · 1 skipped");
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].table).toBe("purchases");
    expect(db.calls[0].options).toEqual({ onConflict: "order_ref,line_key", ignoreDuplicates: true });
    expect(db.calls.every((c) => c.op === "upsert")).toBe(true);
  });

  it("keeps the unmatched with a null product", async () => {
    await importPurchases(paste);
    const rows = db.calls[0].rows!;
    expect(rows.filter((r) => r.product_id === null)).toHaveLength(2);
    expect(rows.filter((r) => r.product_id === "p1")).toHaveLength(1);
  });

  it("a re-paste of the same orders adds nothing", async () => {
    await importPurchases(paste);
    const again = await importPurchases(paste);
    expect(again).toMatchObject({ imported: 0, matched: 0, orders: 2, skipped: 1 });
  });

  it("only bad lines writes nothing", async () => {
    const r = await importPurchases("nope\n{}");
    expect(r.line).toBe("Imported 0 from 0 orders · 0 matched · 2 skipped");
    expect(db.calls).toHaveLength(0);
  });
});

describe("purchasesPerProduct", () => {
  it("reads matched purchases in the window and tallies them per product", async () => {
    db.pages.push([
      { product_id: "p1", order_ref: "A", ordered_on: "2026-10-30", quantity: "2.000" },
      { product_id: "p1", order_ref: "B", ordered_on: "2026-10-23", quantity: "1.000" },
    ]);
    const t = await purchasesPerProduct(4, new Date("2026-11-02T12:00:00Z"));
    expect(t.get("p1")).toEqual({ product_id: "p1", orders: 2, quantity: 3, last_ordered_on: "2026-10-30" });
    const f = db.reads[0].filters;
    expect(f).toContainEqual(["gte", "ordered_on", "2026-10-05"]);
    expect(f).toContainEqual(["lte", "ordered_on", "2026-11-02"]);
    expect(f.some(([op, col]) => op === "not" && col === "product_id")).toBe(true);
  });
});

describe("POST /api/purchases", () => {
  const post = (body: unknown) =>
    POST(new NextRequest("https://example.test/api/purchases", { method: "POST", body: JSON.stringify(body) }));

  it("refuses an empty paste", async () => {
    expect((await post({ text: "  " })).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });

  it("returns the counts", async () => {
    const res = await post({ text: line() });
    expect(res.status).toBe(200);
    expect((await res.json()).line).toBe("Imported 1 from 1 order · 1 matched · 0 skipped");
  });

  it("is refused signed out by the gate, with no new exception", async () => {
    process.env.SESSION_SECRET = "test-session-secret-0123456789-abcdefghij";
    const res = await proxy(new NextRequest("https://example.test/api/purchases", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("x-middleware-next")).not.toBe("1");
  });
});
