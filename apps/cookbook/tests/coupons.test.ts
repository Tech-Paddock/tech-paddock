import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

/**
 * Import coupons (TEC-230): parse, bad lines skipped, a re-paste adds nothing,
 * `week_seen` is the Denver Monday, the route is signed in like every `/api`
 * route, and the Deals Coupon filter sees an imported coupon. The client is a
 * recorder that keeps the table's unique key and its checks. Made-up coupons.
 */

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; rows?: Row[]; options?: Record<string, unknown> }[],
  stored: [] as Row[],
}));

vi.mock("@/lib/supabase", () => ({
  getServiceClient: () => ({
    from: (table: string) => ({
      // The unique key (week_seen, title, amount) with ignoreDuplicates: only new rows come back.
      upsert: (rows: Row[], options: Record<string, unknown>) => {
        db.calls.push({ table, op: "upsert", rows, options });
        const added = rows.filter((r) => !db.stored.some((s) => s.week_seen === r.week_seen && s.title === r.title && s.amount === r.amount));
        for (const r of added) db.stored.push({ ...r, id: `c${db.stored.length + 1}` });
        return { select: async () => ({ data: added.map((r) => ({ product_ids: r.product_ids })), error: null }) };
      },
      select: () => ({
        order: () => ({ limit: async () => ({ data: db.stored, error: null }) }),
      }),
    }),
  }),
}));

import { parseCoupons, summary, toRows, weekSeen } from "@/lib/coupons";
import { importCoupons, readCoupons } from "@/lib/couponStore";
import { POST } from "@/app/api/coupons/route";
import { buildDealBoard } from "@/lib/dealRows";
import { NO_FILTER, matchesFilter } from "@/lib/dealFilter";
import type { SavedProduct } from "@/lib/brands";

const CODE = "0001111012345";
// Wednesday 2026-11-04, noon in Denver: its Monday is 2026-11-02.
const WED = new Date("2026-11-04T19:00:00Z");

const line = (o: Record<string, unknown> = {}) =>
  JSON.stringify({ title: "Test Brand Pasta Sauce", amount: "$1.00 off", expires_on: "2026-11-18", product_ids: [CODE], ...o });

beforeEach(() => {
  db.calls.length = 0;
  db.stored.length = 0;
});

describe("parseCoupons", () => {
  it("reads one object per line, blank lines are not lines", () => {
    const r = parseCoupons([line(), "", line({ title: "Test Brand Rice", amount: "Save $2 when you buy 2", expires_on: undefined, product_ids: undefined })].join("\n"));
    expect(r.skipped).toBe(0);
    expect(r.lines).toEqual([
      { title: "Test Brand Pasta Sauce", amount: "$1.00 off", expires_on: "2026-11-18", product_ids: [CODE] },
      { title: "Test Brand Rice", amount: "Save $2 when you buy 2", expires_on: null, product_ids: [] },
    ]);
  });

  it("reads Windows line endings and trims and collapses the text", () => {
    const r = parseCoupons(`${line({ title: "  Test   Brand  Chips " })}\r\n${line({ title: "Other" })}\r\n`);
    expect(r.lines.map((l) => l.title)).toEqual(["Test Brand Chips", "Other"]);
  });

  it("skips and counts a bad line, never guessing", () => {
    const bad = [
      "not json",
      "[1,2]",
      "42",
      line({ title: "" }),
      line({ title: undefined }),
      line({ amount: "   " }),
      line({ amount: 5 }),
      line({ expires_on: "2026-02-30" }),
      line({ expires_on: "Nov 18" }),
      line({ product_ids: "00011110123456" }),
    ];
    const r = parseCoupons([...bad, line()].join("\n"));
    expect(r.skipped).toBe(bad.length);
    expect(r.lines).toHaveLength(1);
  });

  it("drops an invalid product code and counts it, keeping the coupon", () => {
    const r = parseCoupons(line({ product_ids: [CODE, "1234567", "123456789012345", "12ab5678", 12345678, null, CODE, "00011110"] }));
    expect(r.skipped).toBe(0);
    expect(r.lines[0].product_ids).toEqual([CODE, "00011110"]);
    expect(r.droppedCodes).toBe(5);
  });

  it("accepts 8 and 14 digits, refuses 7 and 15", () => {
    expect(parseCoupons(line({ product_ids: ["12345678", "12345678901234"] })).lines[0].product_ids).toHaveLength(2);
    expect(parseCoupons(line({ product_ids: ["1234567", "123456789012345"] })).lines[0].product_ids).toEqual([]);
  });
});

describe("the Monday", () => {
  it("is this week's Monday in Denver", () => {
    expect(weekSeen(WED)).toBe("2026-11-02");
    expect(weekSeen(new Date("2026-11-02T20:00:00Z"))).toBe("2026-11-02");
    expect(weekSeen(new Date("2026-11-08T20:00:00Z"))).toBe("2026-11-02");
  });

  it("follows Denver, not UTC: Sunday 23:30 in Denver is still the old week", () => {
    expect(weekSeen(new Date("2026-11-02T06:30:00Z"))).toBe("2026-10-26");
    expect(weekSeen(new Date("2026-11-02T07:30:00Z"))).toBe("2026-11-02");
  });

  it("is set on every row written", async () => {
    await importCoupons(line(), WED);
    expect(db.calls[0].rows!.every((r) => r.week_seen === "2026-11-02")).toBe(true);
  });
});

describe("importCoupons", () => {
  const paste = [line(), line({ title: "Test Brand Rice", product_ids: [] }), "garbage", line({ title: "Test Brand Beans", product_ids: ["1234"] })].join("\n");

  it("writes with ignoreDuplicates on the unique key and reports the one line", async () => {
    const r = await importCoupons(paste, WED);
    expect(r).toMatchObject({ imported: 3, withCodes: 1, skipped: 1, droppedCodes: 1 });
    expect(r.line).toBe("Imported 3 coupons · 1 with product codes · 1 skipped");
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].table).toBe("coupons");
    expect(db.calls[0].options).toEqual({ onConflict: "week_seen,title,amount", ignoreDuplicates: true });
    expect(db.calls.every((c) => c.op === "upsert")).toBe(true);
  });

  it("a re-paste adds nothing", async () => {
    await importCoupons(paste, WED);
    const again = await importCoupons(paste, WED);
    expect(again).toMatchObject({ imported: 0, withCodes: 0, skipped: 1 });
    expect(again.line).toBe("Imported 0 coupons · 0 with product codes · 1 skipped");
    expect(db.stored).toHaveLength(3);
  });

  it("the next week's paste of the same coupon is a new row", async () => {
    await importCoupons(line(), WED);
    const next = await importCoupons(line(), new Date("2026-11-11T19:00:00Z"));
    expect(next.imported).toBe(1);
    expect(db.stored.map((r) => r.week_seen)).toEqual(["2026-11-02", "2026-11-09"]);
  });

  it("the same coupon twice in one paste is one row", () => {
    const rows = toRows(parseCoupons([line(), line({ product_ids: [] })].join("\n")).lines, "2026-11-02");
    expect(rows).toHaveLength(1);
    expect(rows[0].product_ids).toEqual([CODE]);
  });

  it("only bad lines writes nothing", async () => {
    const r = await importCoupons("nope\n{}", WED);
    expect(r.line).toBe("Imported 0 coupons · 0 with product codes · 2 skipped");
    expect(db.calls).toHaveLength(0);
  });

  it("says one coupon in the singular", () => {
    expect(summary(1, 0, 0).line).toBe("Imported 1 coupon · 0 with product codes · 0 skipped");
  });
});

describe("POST /api/coupons", () => {
  const post = (body: unknown) =>
    POST(new NextRequest("https://example.test/api/coupons", { method: "POST", body: JSON.stringify(body) }));

  it("refuses an empty paste", async () => {
    expect((await post({ text: "  " })).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });

  it("returns the counts", async () => {
    const res = await post({ text: line() });
    expect(res.status).toBe(200);
    expect((await res.json()).line).toBe("Imported 1 coupon · 1 with product codes · 0 skipped");
  });

  it("is refused signed out by the gate, with no new exception", async () => {
    process.env.SESSION_SECRET = "test-session-secret-0123456789-abcdefghij";
    const res = await proxy(new NextRequest("https://example.test/api/coupons", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("x-middleware-next")).not.toBe("1");
  });
});

describe("the Deals Coupon filter", () => {
  const product = { id: "id-cola", product_id: CODE, names: ["test pasta sauce"], count: 1, default_for: [] } as unknown as SavedProduct;
  const board = (coupons: Awaited<ReturnType<typeof readCoupons>>) =>
    buildDealBoard({
      asOf: "2026-11-04",
      store: { locationId: "01400999", name: "Test Store" },
      products: [product],
      nights: [{ product_id: CODE, location_id: "01400999", night: "2026-11-04", regular: 4, sale: null, in_stock: true, aisle: "Pantry" }],
      weeks: [],
      coupons: coupons.coupons,
      couponsStaged: coupons.staged,
      scan: null,
    });

  it("before any import says nothing is staged and shows no coupon rows", async () => {
    const b = board(await readCoupons());
    expect(b.couponsStaged).toBe(false);
    expect(b.rows.filter((r) => matchesFilter(r, { ...NO_FILTER, kind: "coupon" }))).toHaveLength(0);
  });

  it("sees an imported coupon on its product, by code", async () => {
    await importCoupons([line(), line({ title: "Other Brand", product_ids: ["0009999000009"] })].join("\n"), WED);
    const b = board(await readCoupons());
    expect(b.couponsStaged).toBe(true);
    const hits = b.rows.filter((r) => matchesFilter(r, { ...NO_FILTER, kind: "coupon" }));
    expect(hits).toHaveLength(1);
    expect(hits[0].coupons).toEqual([{ title: "Test Brand Pasta Sauce", amount: "$1.00 off", expires_on: "2026-11-18" }]);
  });
});
