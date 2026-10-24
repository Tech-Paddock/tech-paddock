import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NightRow, WeekRow } from "@/lib/priceWeeks";

/**
 * The price tables are insert only (TEC-132): every write is an upsert that
 * **ignores** a conflict on the table's unique key, never one that updates, so
 * a rerun cannot overwrite a night or a week. The client is a recorder.
 */

const db = vi.hoisted(() => ({
  calls: [] as { table: string; rows: unknown[]; options: Record<string, unknown> }[],
  returned: [] as { product_id: string }[],
  reads: [] as { table: string; filters: [string, string, unknown][]; range: [number, number] | null }[],
  pages: [] as unknown[][],
}));

vi.mock("@/lib/supabase", () => ({
  getServiceClient: () => ({
    from: (table: string) => ({
      upsert: (rows: unknown[], options: Record<string, unknown>) => {
        db.calls.push({ table, rows, options });
        return { select: async () => ({ data: db.returned, error: null }) };
      },
      select: () => {
        const read = { table, filters: [] as [string, string, unknown][], range: null as [number, number] | null };
        db.reads.push(read);
        const chain: Record<string, unknown> = {};
        for (const op of ["eq", "gte", "lte"]) {
          chain[op] = (col: string, value: unknown) => {
            read.filters.push([op, col, value]);
            return chain;
          };
        }
        chain.order = () => chain;
        chain.range = async (a: number, b: number) => {
          read.range = [a, b];
          return { data: db.pages.shift() ?? [], error: null };
        };
        return chain;
      },
    }),
  }),
}));

beforeEach(() => {
  db.calls = [];
  db.reads = [];
  db.pages = [];
  db.returned = [];
});

const night: NightRow = { product_id: "0001111000001", location_id: "01400999", night: "2026-10-27", regular: 5, sale: null, in_stock: true, aisle: "Pantry" };
const week: WeekRow = {
  product_id: "0001111000001",
  location_id: "01400999",
  week_start: "2026-10-19",
  low: 3,
  high: 5,
  mean: 4.5,
  regular_mean: 5,
  nights_on_sale: 2,
  nights_seen: 7,
};

describe("writing a night", () => {
  it("upserts on the unique key and ignores a conflict, and reports only the rows written", async () => {
    const { insertNights } = await import("@/lib/priceStore");
    db.returned = [{ product_id: night.product_id }];
    expect(await insertNights([night, { ...night, product_id: "0001111000002" }])).toBe(1);
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].table).toBe("price_nights");
    expect(db.calls[0].options).toEqual({ onConflict: "product_id,location_id,night", ignoreDuplicates: true });
  });

  it("a rerun that wrote nothing reports 0", async () => {
    const { insertNights } = await import("@/lib/priceStore");
    db.returned = [];
    expect(await insertNights([night])).toBe(0);
  });

  it("writes nothing for no rows, without calling the database", async () => {
    const { insertNights, insertWeeks } = await import("@/lib/priceStore");
    expect(await insertNights([])).toBe(0);
    expect(await insertWeeks([])).toBe(0);
    expect(db.calls).toHaveLength(0);
  });
});

describe("writing a week", () => {
  it("upserts on the unique key and ignores a conflict", async () => {
    const { insertWeeks } = await import("@/lib/priceStore");
    db.returned = [{ product_id: week.product_id }];
    expect(await insertWeeks([week])).toBe(1);
    expect(db.calls[0].table).toBe("price_weeks");
    expect(db.calls[0].options).toEqual({ onConflict: "product_id,location_id,week_start", ignoreDuplicates: true });
  });
});

describe("reading", () => {
  it("pages past PostgREST's cap until a page comes back short, and reads numeric strings as numbers", async () => {
    const { readWeeksSince } = await import("@/lib/priceStore");
    const full = Array.from({ length: 1000 }, (_, i) => ({ ...week, product_id: String(1111000000 + i).padStart(13, "0"), low: "3.00", high: "5.00", mean: "4.5000", regular_mean: "5.0000" }));
    db.pages = [full, [{ ...week, low: "3.00", high: "5.00", mean: "4.5000", regular_mean: null }]];
    const rows = await readWeeksSince("01400999", "2026-08-03");
    expect(rows).toHaveLength(1001);
    expect(rows[0]).toMatchObject({ low: 3, high: 5, mean: 4.5, regular_mean: 5 });
    expect(rows[1000].regular_mean).toBeNull();
    expect(db.reads.map((r) => r.range)).toEqual([[0, 999], [1000, 1999]]);
    expect(db.reads[0].filters).toEqual([["eq", "location_id", "01400999"], ["gte", "week_start", "2026-08-03"]]);
  });

  it("reads a week's nights across stores, both ends inclusive", async () => {
    const { readNightsBetween } = await import("@/lib/priceStore");
    db.pages = [[{ ...night, regular: "5.00", sale: null }]];
    const rows = await readNightsBetween("2026-10-19", "2026-10-25");
    expect(rows[0]).toMatchObject({ regular: 5, sale: null, in_stock: true, aisle: "Pantry" });
    expect(db.reads[0].filters).toEqual([["gte", "night", "2026-10-19"], ["lte", "night", "2026-10-25"]]);
  });
});
