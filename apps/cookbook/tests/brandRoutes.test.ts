import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Paste a batch and Export through their routes (TEC-51), against an
 * in-memory `brand_preferences`. **The review writes nothing; a write never
 * overwrites a saved row unless its entry carries the review's tick.** Neutral
 * fake items only.
 */

type Row = Record<string, unknown> & { id: string };

const db = vi.hoisted(() => ({
  rows: [] as Row[],
  writes: [] as { op: string; payload: Record<string, unknown> }[],
  next: 1,
}));

vi.mock("@/lib/supabase", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({ order: async () => ({ data: db.rows.map((r) => ({ ...r })), error: null }) }),
      insert: (payload: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            db.writes.push({ op: "insert", payload });
            const row = { id: `new-${db.next++}`, brand: null, note: null, tally: 0, created_at: "", ...payload } as Row;
            db.rows.push(row);
            return { data: row, error: null };
          },
        }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => {
          const apply = () => {
            db.writes.push({ op: "update", payload: { id, ...payload } });
            const row = db.rows.find((r) => r.id === id) as Row;
            Object.assign(row, payload);
            return row;
          };
          return {
            select: () => ({ single: async () => ({ data: apply(), error: null }) }),
            then: (resolve: (v: unknown) => void) => {
              apply();
              resolve({ error: null });
            },
          };
        },
      }),
    }),
  }),
}));

const A = "https://www.kingsoopers.com/p/test-cereal-honey/0001111000001";
const B = "https://www.kingsoopers.com/p/test-cereal-plain/0001111000002";

function post(path: string, body: unknown) {
  return new NextRequest(`https://cookbook.techpaddock.io${path}`, { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  db.rows = [
    { id: "a", phrase: "test cereal", kind: "product", url: A, terms: null, brand: null, note: null, tally: 4, created_at: "", updated_at: "2026-10-01T00:00:00Z" },
  ];
  db.writes = [];
  db.next = 1;
});

describe("Paste a batch: review, then write the ticked rows", () => {
  it("the review writes nothing, and marks the saved row as already there", async () => {
    const { POST } = await import("@/app/api/preferences/preview/route");
    const res = await POST(post("/api/preferences/preview", { rows: [{ phrase: "test cereal", product: A, count: 9, alternatives: [{ product: B, count: 1 }] }] }));
    const body = await res.json();
    expect(body.entries.map((e: { status: string }) => e.status)).toEqual(["already", "adds"]);
    expect(db.writes).toEqual([]);
  });

  it("a row already in Your brands is not overwritten without the tick, and is reported", async () => {
    const { POST } = await import("@/app/api/preferences/route");
    const body = await (await POST(post("/api/preferences", { rows: [{ phrase: "test cereal", product: A, count: 9 }] }))).json();
    expect(body.saved).toBe(0);
    expect(body.rejected[0].reason).toMatch(/already in Your brands/);
    expect(db.writes).toEqual([]);
    expect(db.rows[0].tally).toBe(4);
  });

  it("ticked, it is overwritten; another product for the phrase is a new row beside it", async () => {
    const { POST } = await import("@/app/api/preferences/route");
    const body = await (
      await POST(post("/api/preferences", { rows: [{ phrase: "test cereal", product: A, count: 9, replace: true }, { phrase: "test cereal", product: B, count: 1 }] }))
    ).json();
    expect(body).toEqual({ saved: 2, rejected: [] });
    expect(db.rows.map((r) => [r.phrase, r.url, r.tally])).toEqual([
      ["test cereal", A, 9],
      ["test cereal", B, 1],
    ]);
  });

  it("plain stays refused", async () => {
    const { POST } = await import("@/app/api/preferences/route");
    const body = await (await POST(post("/api/preferences", { rows: [{ phrase: "test water", kind: "plain" }] }))).json();
    expect(body.saved).toBe(0);
    expect(body.rejected[0].reason).toContain("plain");
  });
});

describe("Export", () => {
  it("downloads Your brands as the batch format, which reviews back as already there", async () => {
    db.rows.push({ id: "b", phrase: "test cereal", kind: "product", url: B, terms: null, brand: null, note: null, tally: 1, created_at: "", updated_at: "2026-10-02T00:00:00Z" });
    const { GET } = await import("@/app/api/preferences/export/route");
    const res = await GET();
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="cookbook-brands-\d{4}-\d{2}-\d{2}\.json"$/);
    const rows = JSON.parse(await res.text());
    expect(rows).toEqual([{ phrase: "test cereal", product: A, count: 4, alternatives: [{ product: B, count: 1 }] }]);

    const { POST } = await import("@/app/api/preferences/preview/route");
    const preview = await (await POST(post("/api/preferences/preview", { rows }))).json();
    expect(preview.entries.map((e: { status: string }) => e.status)).toEqual(["already", "already"]);
    expect(db.writes).toEqual([]);
  });
});

describe("the editor", () => {
  it("edits the row it opened, by id, when a phrase holds several products", async () => {
    db.rows.push({ id: "b", phrase: "test cereal", kind: "product", url: B, terms: null, brand: null, note: null, tally: 1, created_at: "", updated_at: "" });
    const { POST } = await import("@/app/api/preferences/route");
    const C = "https://www.kingsoopers.com/p/test-cereal-family/0001111000003";
    const res = await POST(post("/api/preferences", { id: "b", phrase: "test cereal", kind: "product", url: C }));
    expect(res.status).toBe(200);
    expect(db.rows.find((r) => r.id === "b")?.url).toBe(C);
    expect(db.rows.find((r) => r.id === "a")?.url).toBe(A);
  });
});
