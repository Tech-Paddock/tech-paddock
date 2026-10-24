import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { nightRows, recordNight, type NightDeps } from "@/lib/priceRun";
import { appToken, productsByIds, readProducts as readKrogerProducts, APP_SCOPE, type Product } from "@/lib/kroger";
import { ConflictError, UpstreamError } from "@/lib/errors";
import type { NightRow, WeekRow } from "@/lib/priceWeeks";

/**
 * The nightly scan (TEC-132). **Kroger is mocked**: the lookup is a stub, and
 * the token and batching tests stub `fetch`. The tables are in-memory maps
 * that enforce the same unique keys the migrations do. Made-up products only.
 */

const STORE = "01400999";
const TUESDAY = new Date("2026-10-27T09:00:00Z"); // 03:00 Denver
const MONDAY = new Date("2026-10-26T09:00:00Z");

const code = (n: number) => String(1111000000 + n).padStart(13, "0");

function product(id: string, over: Partial<Product> = {}): Product {
  return {
    productId: id,
    upc: id,
    description: `Test product ${id}`,
    brand: null,
    size: "12 oz",
    price: over.promo ?? over.regular ?? 5,
    regular: 5,
    promo: null,
    promoEnds: null,
    pickup: true,
    delivery: true,
    inStock: true,
    url: `https://www.kingsoopers.com/p/test/${id}`,
    aisle: "Pantry",
    ...over,
  };
}

function world(opts: { codes?: string[]; store?: { locationId: string; name: string } | null; now?: Date; shelf?: (id: string) => Product | null } = {}) {
  const nights = new Map<string, NightRow>();
  const weeks = new Map<string, WeekRow>();
  const codes = opts.codes ?? [code(1), code(2)];
  const calls = { token: 0, byIds: [] as { token: string; ids: string[]; location: string }[], insertWeeks: 0 };
  let shelf = opts.shelf ?? ((id: string) => product(id));
  let now = opts.now ?? TUESDAY;

  const deps: NightDeps = {
    now: () => now,
    store: async () => (opts.store === undefined ? { locationId: STORE, name: "Test Store" } : opts.store),
    productCodes: async () => codes,
    appToken: async () => {
      calls.token += 1;
      return "app-token-TEST";
    },
    byIds: async (token, ids, location) => {
      calls.byIds.push({ token, ids, location });
      return ids.flatMap((id) => {
        const p = shelf(id);
        return p ? [p] : [];
      });
    },
    // The same unique key as the migration; a conflict is ignored.
    insertNights: async (rows) => {
      let written = 0;
      for (const r of rows) {
        const key = `${r.product_id}|${r.location_id}|${r.night}`;
        if (nights.has(key)) continue;
        nights.set(key, r);
        written += 1;
      }
      return written;
    },
    readNightsBetween: async (from, to) => [...nights.values()].filter((n) => n.night >= from && n.night <= to),
    insertWeeks: async (rows) => {
      calls.insertWeeks += 1;
      let written = 0;
      for (const r of rows) {
        const key = `${r.product_id}|${r.location_id}|${r.week_start}`;
        if (weeks.has(key)) continue;
        weeks.set(key, r);
        written += 1;
      }
      return written;
    },
  };
  return {
    deps,
    nights,
    weeks,
    calls,
    setShelf: (s: (id: string) => Product | null) => (shelf = s),
    setNow: (d: Date) => (now = d),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("recording a night", () => {
  it("writes each saved product's regular price, sale price, stock and aisle at the chosen store", async () => {
    const w = world({
      shelf: (id) =>
        id === code(1)
          ? product(id, { regular: 5, promo: 3.49, inStock: false, aisle: "Breakfast" })
          : product(id, { regular: 2.25, promo: null, inStock: true, aisle: null }),
    });
    const report = await recordNight(w.deps);

    expect(report).toMatchObject({ night: "2026-10-27", store: "Test Store", saved: 2, written: 2, alreadyRecorded: 0, notReturned: 0, noPrice: 0, rollup: null });
    expect(w.nights.get(`${code(1)}|${STORE}|2026-10-27`)).toEqual({
      product_id: code(1),
      location_id: STORE,
      night: "2026-10-27",
      regular: 5,
      sale: 3.49,
      in_stock: false,
      aisle: "Breakfast",
    });
    expect(w.nights.get(`${code(2)}|${STORE}|2026-10-27`)).toMatchObject({ regular: 2.25, sale: null, in_stock: true, aisle: null });
  });

  it("uses the app's own token, once, and looks products up by code at the store", async () => {
    const w = world();
    await recordNight(w.deps);
    expect(w.calls.token).toBe(1);
    expect(w.calls.byIds).toEqual([{ token: "app-token-TEST", ids: [code(1), code(2)], location: STORE }]);
  });

  it("never touches the owner's account token: the run imports no connection code", () => {
    const source = readFileSync(resolve(__dirname, "../lib/priceRun.ts"), "utf8");
    expect(source).not.toMatch(/withAccessToken|krogerConnection|krogerCrypto|\brefresh\s*\(/);
    // It reads the connection row for the store only; the sealed token column is not selected here.
    expect(source).not.toMatch(/refresh_token_sealed/);
  });

  it("a rerun on the same night is a no-op, and the first reading stands", async () => {
    const w = world({ shelf: (id) => product(id, { regular: 5, promo: 4 }) });
    const first = await recordNight(w.deps);
    expect(first).toMatchObject({ written: 2, alreadyRecorded: 0 });

    // Kroger's price moves between the two runs; the night keeps what it first read.
    w.setShelf((id) => product(id, { regular: 9, promo: 8 }));
    const second = await recordNight(w.deps);
    expect(second).toMatchObject({ written: 0, alreadyRecorded: 2 });
    expect(w.nights.size).toBe(2);
    expect(w.nights.get(`${code(1)}|${STORE}|2026-10-27`)).toMatchObject({ regular: 5, sale: 4 });
  });

  it("the next night is a new row, and the old one is untouched", async () => {
    const w = world();
    await recordNight(w.deps);
    w.setNow(new Date("2026-10-28T09:00:00Z"));
    await recordNight(w.deps);
    expect([...w.nights.keys()].sort()).toEqual([
      `${code(1)}|${STORE}|2026-10-27`,
      `${code(1)}|${STORE}|2026-10-28`,
      `${code(2)}|${STORE}|2026-10-27`,
      `${code(2)}|${STORE}|2026-10-28`,
    ]);
  });

  it("a product Kroger does not return, or returns with no price, gets no row: a gap, never a zero", async () => {
    const w = world({
      codes: [code(1), code(2), code(3)],
      shelf: (id) => (id === code(1) ? null : id === code(2) ? product(id, { regular: null, promo: null, price: null }) : product(id)),
    });
    const report = await recordNight(w.deps);
    expect(report).toMatchObject({ saved: 3, written: 1, notReturned: 1, noPrice: 1 });
    expect([...w.nights.keys()]).toEqual([`${code(3)}|${STORE}|2026-10-27`]);
  });

  it("with no store chosen there is nothing to record, and it says so", async () => {
    const w = world({ store: null });
    await expect(recordNight(w.deps)).rejects.toBeInstanceOf(ConflictError);
    expect(w.nights.size).toBe(0);
    expect(w.calls.token).toBe(0);
  });

  it("with no saved products it records nothing and asks Kroger nothing", async () => {
    const w = world({ codes: [] });
    expect(await recordNight(w.deps)).toMatchObject({ saved: 0, written: 0 });
    expect(w.calls.token).toBe(0);
  });

  it("a Kroger failure writes nothing and fails the run, so it shows as failed", async () => {
    const w = world();
    w.deps.byIds = async () => {
      throw new UpstreamError("Kroger's product lookup failed (HTTP 503).");
    };
    await expect(recordNight(w.deps)).rejects.toBeInstanceOf(UpstreamError);
    expect(w.nights.size).toBe(0);
    expect(w.calls.insertWeeks).toBe(0); // not a Monday
  });

  it("one code is looked up once however many times it is saved", async () => {
    const w = world({ codes: [code(1), code(1), code(2)] });
    await recordNight(w.deps);
    expect(w.calls.byIds[0].ids).toEqual([code(1), code(2)]);
  });
});

describe("nightRows", () => {
  it("is a row per priced product and counts the rest", () => {
    const found = new Map([
      [`id:${code(1)}`, { product: product(code(1), { regular: 3, promo: 2 }), error: null }],
      [`id:${code(2)}`, { product: null, error: null }],
    ]);
    const { rows, notReturned, noPrice } = nightRows([code(1), code(2)], found, "2026-10-27", STORE);
    expect(rows).toHaveLength(1);
    expect({ notReturned, noPrice }).toEqual({ notReturned: 1, noPrice: 0 });
  });
});

describe("the Monday roll-up", () => {
  /** A full week of nights for one product, 2026-10-19 to 2026-10-25, at 5.00 with two sale nights. */
  function seed(w: ReturnType<typeof world>) {
    const prices: [string, number | null][] = [
      ["2026-10-19", null],
      ["2026-10-20", null],
      ["2026-10-21", 3.5],
      ["2026-10-22", 3],
      ["2026-10-23", null],
      ["2026-10-24", null],
      ["2026-10-25", null],
    ];
    for (const [night, sale] of prices) {
      w.nights.set(`${code(1)}|${STORE}|${night}`, { product_id: code(1), location_id: STORE, night, regular: 5, sale, in_stock: true, aisle: "Pantry" });
    }
  }

  it("on a Monday, rolls up the week that just ended into one row per product", async () => {
    const w = world({ now: MONDAY, codes: [code(1)] });
    seed(w);
    const report = await recordNight(w.deps);

    expect(report.night).toBe("2026-10-26");
    expect(report.rollup).toEqual({ week_start: "2026-10-19", rows: 1, written: 1 });
    expect(w.weeks.get(`${code(1)}|${STORE}|2026-10-19`)).toEqual({
      product_id: code(1),
      location_id: STORE,
      week_start: "2026-10-19",
      low: 3,
      high: 5,
      mean: 4.5,
      regular_mean: 5,
      nights_on_sale: 2,
      nights_seen: 7,
    });
  });

  it("the Monday's own night belongs to the next week, not the one rolled up", async () => {
    const w = world({ now: MONDAY, codes: [code(1)], shelf: (id) => product(id, { regular: 99 }) });
    seed(w);
    await recordNight(w.deps);
    expect(w.weeks.get(`${code(1)}|${STORE}|2026-10-19`)).toMatchObject({ high: 5, nights_seen: 7 });
  });

  it("a rerun of the Monday is a no-op", async () => {
    const w = world({ now: MONDAY, codes: [code(1)] });
    seed(w);
    await recordNight(w.deps);
    const again = await recordNight(w.deps);
    expect(again.rollup).toEqual({ week_start: "2026-10-19", rows: 1, written: 0 });
    expect(w.weeks.size).toBe(1);
  });

  it("on any other day there is no roll-up", async () => {
    const w = world({ now: TUESDAY, codes: [code(1)] });
    seed(w);
    expect((await recordNight(w.deps)).rollup).toBeNull();
    expect(w.weeks.size).toBe(0);
  });

  it("is still rolled up when Kroger fails that Monday, and the run still fails", async () => {
    const w = world({ now: MONDAY, codes: [code(1)] });
    seed(w);
    w.deps.byIds = async () => {
      throw new UpstreamError("Kroger's product lookup failed (HTTP 503).");
    };
    await expect(recordNight(w.deps)).rejects.toBeInstanceOf(UpstreamError);
    expect(w.weeks.size).toBe(1);
  });

  it("keeps the nightly rows: nothing is deleted by the roll-up", async () => {
    const w = world({ now: MONDAY, codes: [code(1)] });
    seed(w);
    await recordNight(w.deps);
    expect([...w.nights.keys()].filter((k) => k.endsWith("2026-10-19"))).toHaveLength(1);
    expect(w.nights.size).toBe(7 + 1); // the week's seven, and the Monday's own
  });
});

describe("Kroger's app token and batching (fetch stubbed)", () => {
  it("asks for the client-credentials grant, product scope only, with the app's own credentials", async () => {
    const seen: { url: string; body: string; auth: string | null }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      seen.push({ url, body: String(init.body), auth: new Headers(init.headers).get("authorization") });
      return new Response(JSON.stringify({ access_token: "app-at", expires_in: 1800 }), { status: 200 });
    });
    const token = await appToken({ KROGER_CLIENT_ID: "test-client", KROGER_CLIENT_SECRET: "test-secret" });

    expect(token).toBe("app-at");
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toMatch(/\/connect\/oauth2\/token$/);
    const form = new URLSearchParams(seen[0].body);
    expect(form.get("grant_type")).toBe("client_credentials");
    expect(form.get("scope")).toBe("product.compact");
    expect(form.get("scope")).toBe(APP_SCOPE);
    expect(form.get("refresh_token")).toBeNull();
    expect(seen[0].auth).toBe(`Basic ${Buffer.from("test-client:test-secret").toString("base64")}`);
  });

  it("needs only the client ID and secret, and names what is missing", async () => {
    await expect(appToken({})).rejects.toThrow(/KROGER_CLIENT_ID is not set; KROGER_CLIENT_SECRET is not set/);
  });

  it("looks products up by code, fifty to a request", async () => {
    const urls: URL[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(new URL(url));
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    const ids = Array.from({ length: 120 }, (_, i) => code(i + 1));
    await productsByIds("app-at", ids, STORE);
    expect(urls).toHaveLength(3);
    expect(urls.map((u) => u.searchParams.get("filter.productId")?.split(",").length)).toEqual([50, 50, 20]);
    expect(urls.every((u) => u.searchParams.get("filter.locationId") === STORE)).toBe(true);
  });

  it("reads Kroger's first category as the aisle", () => {
    const body = {
      data: [
        { productId: code(1), upc: code(1), description: "Test one", categories: ["Breakfast", "Cereal"], items: [{ price: { regular: 3, promo: 2 } }] },
        { productId: code(2), upc: code(2), description: "Test two", items: [{ price: { regular: 3 } }] },
        { productId: code(3), upc: code(3), description: "Test three", categories: [], items: [] },
      ],
    };
    expect(readKrogerProducts(body).map((p) => p.aisle)).toEqual(["Breakfast", null, null]);
  });
});
