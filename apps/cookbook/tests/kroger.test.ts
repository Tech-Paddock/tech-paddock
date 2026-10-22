import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { keyProblem, makeState, open, readKey, seal, stateIsValid } from "@/lib/krogerCrypto";
import { configProblems, REDIRECT_URI, SCOPES, authorizeUrl } from "@/lib/kroger";

/**
 * The King Soopers connection (TEC-90). **Kroger is mocked entirely** — no
 * session here can reach it — and so is the database: `lib/krogerStore.ts`,
 * the list and the brands are replaced by an in-memory row.
 *
 * What these hold: the token is sealed at rest and a wrong key cannot open it;
 * a callback with a bad state writes nothing; and **no response body any route
 * sends ever carries a token**, sealed or plain.
 */

const KEY_B64 = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY_B64 = Buffer.alloc(32, 9).toString("base64");
const STORED_RT = "rt-stored-SECRET-1111";
const NEW_RT = "rt-rotated-SECRET-2222";
const ACCESS = "at-access-SECRET-3333";
const CLIENT_SECRET = "client-SECRET-4444";

const mem = vi.hoisted(() => ({
  row: null as null | Record<string, unknown>,
  products: [] as Record<string, unknown>[],
  list: [] as Record<string, unknown>[],
  prefs: [] as Record<string, unknown>[],
  sent: [] as string[],
  unsent: [] as string[],
  ledger: [] as Record<string, unknown>[],
  tokenWrites: [] as string[],
  scans: [] as Record<string, unknown>[],
  saved: [] as Record<string, unknown>[],
  brandRows: [] as Record<string, unknown>[],
  bumps: [] as string[][],
}));

vi.mock("@/lib/dealStore", () => ({
  readLatestScan: async () => mem.scans[mem.scans.length - 1] ?? null,
  appendScan: async (scan: Record<string, unknown>) => {
    const row = { id: `scan-${mem.scans.length + 1}`, ran_at: new Date().toISOString(), ...scan };
    mem.scans.push(row);
    return row;
  },
}));

vi.mock("@/lib/krogerStore", () => ({
  readConnectionRow: async () => mem.row,
  writeRefreshToken: async (sealed: string) => {
    mem.tokenWrites.push(sealed);
    mem.row = { location_id: null, store_name: null, connected_at: "2026-10-20T00:00:00Z", refreshed_at: null, ...(mem.row ?? {}), refresh_token_sealed: sealed };
  },
  writeStore: async (location_id: string, store_name: string) => {
    mem.row = { ...(mem.row ?? {}), location_id, store_name };
  },
  writeRefreshedAt: async (at: string) => {
    mem.row = { ...(mem.row ?? {}), refreshed_at: at };
  },
  writeModality: async (modality: string) => {
    mem.row = { ...(mem.row ?? {}), modality };
  },
  deleteConnectionRow: async () => {
    mem.row = null;
  },
}));

// Your brands, one row per product code (TEC-131), in memory.
vi.mock("@/lib/productStore", () => ({
  readProducts: async () => mem.brandRows,
  rememberProduct: async (name: string, upc: string, page: string, size: string | null) => {
    mem.saved.push({ name, upc, page, size });
  },
  bumpCounts: async (upcs: string[]) => {
    mem.bumps.push(upcs);
  },
  writeCache: async (id: string, patch: Record<string, unknown>) => {
    mem.products.push({ id, ...patch });
  },
}));

vi.mock("@/lib/grocery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/grocery")>()),
  readList: async () => mem.list,
  markSent: async (ids: string[]) => {
    mem.sent.push(...ids);
  },
  markUnsent: async (ids: string[]) => {
    mem.unsent.push(...ids);
  },
}));

vi.mock("@/lib/cartSends", () => ({
  readSends: async (ids: string[]) => mem.ledger.filter((r) => ids.includes(String(r.item_id))),
  appendSends: async (rows: Record<string, unknown>[]) => {
    mem.ledger.push(...rows);
  },
  moveSends: async () => undefined,
}));

vi.mock("@/lib/preferences", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/preferences")>()),
  readPreferences: async () => mem.prefs,
}));

const PRODUCT = {
  productId: "0001111041700",
  upc: "0001111041700",
  description: "Kroger 2% Milk",
  brand: "Kroger",
  items: [{ size: "1 gal", price: { regular: 3.49, promo: 0 }, inventory: { stockLevel: "HIGH" } }],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Kroger, faked. Every request it receives is kept, so a test can say none was made. */
const defaultKroger = async (input: string | URL | Request, _init?: RequestInit) => {
  const url = String(input);
  if (url.endsWith("/connect/oauth2/token")) return json({ access_token: ACCESS, refresh_token: NEW_RT, expires_in: 1800 });
  if (url.includes("/locations")) {
    return json({ data: [{ locationId: "62000001", name: "King Soopers Test", address: { addressLine1: "1 Main St", city: "Denver", state: "CO", zipCode: "80202" } }] });
  }
  if (url.includes("/products")) return json({ data: [PRODUCT] });
  if (url.endsWith("/cart/add")) return new Response(null, { status: 204 });
  return json({ error: "unexpected" }, 500);
};
const kroger = vi.fn(defaultKroger);

function key() {
  return readKey(KEY_B64);
}

beforeEach(() => {
  vi.stubEnv("KROGER_CLIENT_ID", "client-id");
  vi.stubEnv("KROGER_CLIENT_SECRET", CLIENT_SECRET);
  vi.stubEnv("KROGER_TOKEN_KEY", KEY_B64);
  vi.stubGlobal("fetch", kroger);
  kroger.mockClear();
  mem.row = {
    refresh_token_sealed: seal(STORED_RT, key()),
    location_id: "62000001",
    store_name: "King Soopers Test",
    connected_at: "2026-10-01T00:00:00Z",
    refreshed_at: null,
  };
  mem.products = [];
  mem.list = [
    { id: "a", name: "milk", note: null, source: "manual", checked: false, created_at: "2026-10-20T00:00:00Z", recipes: [], quantity: 2, sent_at: null },
    { id: "b", name: "eggs", note: null, source: "manual", checked: false, created_at: "2026-10-20T00:00:00Z", recipes: [], quantity: 1, sent_at: null },
  ];
  mem.prefs = [];
  mem.brandRows = [
    {
      id: "p1",
      product_id: "0001111041700",
      names: ["milk"],
      count: 4,
      size_first: "1 gal",
      brand: null,
      note: null,
      description: null,
      kroger_brand: null,
      size: null,
      url: "https://www.kingsoopers.com/p/kroger-2-milk/0001111041700",
      price: null,
      in_stock: null,
      checked_at: null,
      missing_since: null,
      successor: null,
      pack_label: null,
      pack_size: null,
      pack_unit: null,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    },
  ];
  mem.bumps = [];
  mem.sent = [];
  mem.unsent = [];
  mem.ledger = [];
  mem.tokenWrites = [];
  mem.scans = [];
  mem.saved = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the refresh token at rest", () => {
  it("round-trips under the right key", () => {
    expect(open(seal(STORED_RT, key()), key())).toBe(STORED_RT);
  });

  it("is not readable in its sealed form, and carries the prefix the table requires", () => {
    const sealed = seal(STORED_RT, key());
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed).not.toContain(STORED_RT);
    // A fresh IV every time: the same token never seals to the same string.
    expect(seal(STORED_RT, key())).not.toBe(sealed);
  });

  it("refuses to open under a wrong key — it throws, never returns a different string", () => {
    const sealed = seal(STORED_RT, key());
    expect(() => open(sealed, readKey(OTHER_KEY_B64))).toThrow(/KROGER_TOKEN_KEY has changed/);
  });

  it("refuses an edited value", () => {
    const sealed = seal(STORED_RT, key());
    const bytes = Buffer.from(sealed.slice(3), "base64");
    bytes[bytes.length - 1] ^= 1;
    expect(() => open(`v1:${bytes.toString("base64")}`, key())).toThrow();
    expect(() => open(STORED_RT, key())).toThrow(/not in a form this app wrote/);
  });

  it("needs a key of exactly 32 bytes, and says so in words", () => {
    expect(keyProblem(KEY_B64)).toBeNull();
    expect(keyProblem(undefined)).toMatch(/not set/);
    expect(keyProblem(Buffer.alloc(16).toString("base64"))).toMatch(/32 bytes/);
  });
});

describe("a deployment without the variables", () => {
  it("names each missing one", () => {
    expect(configProblems({})).toEqual([
      "KROGER_CLIENT_ID is not set",
      "KROGER_CLIENT_SECRET is not set",
      "KROGER_TOKEN_KEY is not set",
    ]);
  });

  it("the list tab is told in words, from the status route", async () => {
    vi.stubEnv("KROGER_CLIENT_SECRET", "");
    const { GET } = await import("@/app/api/kroger/route");
    const body = await (await GET()).json();
    expect(body.configured).toBe(false);
    expect(body.problems).toEqual(["KROGER_CLIENT_SECRET is not set"]);
  });
});

describe("the sign-in", () => {
  it("asks for exactly the cart and product scopes, and returns to the registered page route", () => {
    const url = new URL(authorizeUrl({ clientId: "client-id" }, "s"));
    expect(url.origin + url.pathname).toBe("https://api.kroger.com/v1/connect/oauth2/authorize");
    expect(url.searchParams.get("scope")).toBe("cart.basic:write product.compact");
    expect(SCOPES).toBe("cart.basic:write product.compact");
    expect(url.searchParams.get("redirect_uri")).toBe("https://cookbook.techpaddock.io/kroger/callback");
    expect(REDIRECT_URI).not.toMatch(/\/api\//);
  });

  it("state: accepted only when it matches the cookie and carries this app's signature", () => {
    const state = makeState(key());
    expect(stateIsValid(state, state, key())).toBe(true);
    expect(stateIsValid(state, makeState(key()), key())).toBe(false);
    expect(stateIsValid(state, null, key())).toBe(false);
    // A pair planted together — from a sibling subdomain, say — is not signed.
    expect(stateIsValid("planted.value", "planted.value", key())).toBe(false);
    expect(stateIsValid(state, state, readKey(OTHER_KEY_B64))).toBe(false);
  });

  it("/kroger/connect sets the state cookie and sends the browser to Kroger with the same state", async () => {
    const { GET } = await import("@/app/kroger/connect/route");
    const res = await GET(new NextRequest("https://cookbook.techpaddock.io/kroger/connect"));
    const location = new URL(res.headers.get("location") as string);
    const cookie = res.cookies.get("cookbook_kroger_state");
    expect(location.host).toBe("api.kroger.com");
    expect(cookie?.value).toBe(location.searchParams.get("state"));
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe("/kroger");
    expect(location.toString()).not.toContain(CLIENT_SECRET);
  });
});

describe("the callback", () => {
  async function callback(query: string, cookieState: string | null) {
    const { GET } = await import("@/app/kroger/callback/route");
    const headers: Record<string, string> = cookieState ? { cookie: `cookbook_kroger_state=${cookieState}` } : {};
    return GET(new NextRequest(`https://cookbook.techpaddock.io/kroger/callback?${query}`, { headers }));
  }

  it("rejects a bad state: nothing is written and Kroger is never called", async () => {
    mem.row = null;
    const good = makeState(key());
    const res = await callback(`code=abc&state=${encodeURIComponent(makeState(key()))}`, good);
    expect(new URL(res.headers.get("location") as string).searchParams.get("kroger")).toBe("bad-state");
    expect(kroger).not.toHaveBeenCalled();
    expect(mem.tokenWrites).toEqual([]);
    expect(mem.row).toBeNull();
  });

  it("rejects a state with no cookie at all", async () => {
    const state = makeState(key());
    const res = await callback(`code=abc&state=${encodeURIComponent(state)}`, null);
    expect(new URL(res.headers.get("location") as string).searchParams.get("kroger")).toBe("bad-state");
    expect(kroger).not.toHaveBeenCalled();
  });

  it("a good state stores the refresh token sealed, and the redirect carries one word", async () => {
    mem.row = null;
    const state = makeState(key());
    const res = await callback(`code=abc&state=${encodeURIComponent(state)}`, state);
    const location = res.headers.get("location") as string;
    expect(new URL(location).pathname).toBe("/list");
    expect(new URL(location).searchParams.get("kroger")).toBe("connected");
    expect(mem.tokenWrites).toHaveLength(1);
    expect(mem.tokenWrites[0]).not.toContain(NEW_RT);
    expect(open(mem.tokenWrites[0], key())).toBe(NEW_RT);
    for (const secret of [NEW_RT, ACCESS, CLIENT_SECRET]) expect(location).not.toContain(secret);
    expect(await res.text()).not.toContain(NEW_RT);
    // The state cookie is cleared whatever happened.
    expect(res.cookies.get("cookbook_kroger_state")?.value).toBe("");
  });

  it("a sign-in cancelled at Kroger saves nothing", async () => {
    mem.row = null;
    const state = makeState(key());
    const res = await callback(`error=access_denied&state=${encodeURIComponent(state)}`, state);
    expect(new URL(res.headers.get("location") as string).searchParams.get("kroger")).toBe("declined");
    expect(mem.tokenWrites).toEqual([]);
  });
});

describe("no token appears in any response body", () => {
  const secrets = () => [STORED_RT, NEW_RT, ACCESS, CLIENT_SECRET, String(mem.row?.refresh_token_sealed ?? "never")];

  async function bodyOf(res: Response) {
    const text = await res.text();
    for (const secret of secrets()) expect(text).not.toContain(secret);
    return JSON.parse(text);
  }

  it("the status", async () => {
    const { GET } = await import("@/app/api/kroger/route");
    const body = await bodyOf(await GET());
    expect(body).toMatchObject({ configured: true, connected: true, store: { locationId: "62000001" } });
  });

  it("the store search and the store pick", async () => {
    const { GET, PUT } = await import("@/app/api/kroger/store/route");
    const found = await bodyOf(await GET(new NextRequest("https://cookbook.techpaddock.io/api/kroger/store?zip=80202")));
    expect(found.stores[0].locationId).toBe("62000001");
    await bodyOf(
      await PUT(
        new NextRequest("https://cookbook.techpaddock.io/api/kroger/store", {
          method: "PUT",
          body: JSON.stringify({ locationId: "62000001", name: "King Soopers Test" }),
        })
      )
    );
  });

  it("the review, the send, and the second send's warning", async () => {
    const { GET, POST } = await import("@/app/api/kroger/cart/route");
    const review = await bodyOf(await GET());
    expect(review.lines.map((l: { plan: { kind: string } }) => l.plan.kind)).toEqual(["exact", "match"]);
    expect(review.checkoutUrl).toBe("https://www.kingsoopers.com/cart");

    const send = (again: boolean) =>
      POST(
        new NextRequest("https://cookbook.techpaddock.io/api/kroger/cart", {
          method: "POST",
          body: JSON.stringify({ picks: [{ id: "a", upc: "0001111041700" }], again }),
        })
      );

    const first = await bodyOf(await send(false));
    expect(first.outcomes.map((o: { result: string }) => o.result)).toEqual(["added", "skipped"]);
    expect(mem.sent).toEqual(["a"]);

    // The route only records; this is what the database would now say.
    mem.list[0].sent_at = "2026-10-20T12:00:00Z";
    const before = kroger.mock.calls.length;
    const second = await send(false);
    expect(second.status).toBe(409);
    const warned = await bodyOf(second);
    expect(warned.alreadySent.map((l: { name: string }) => l.name)).toEqual(["milk"]);
    // Refused before Kroger was asked for anything.
    expect(kroger.mock.calls.length).toBe(before);
  });

  it("a tapped match goes in, then is remembered as an exact product under the line's name, note dropped (TEC-128)", async () => {
    // An older row whose name still carries its note.
    mem.list[1] = { ...mem.list[1], name: "eggs — the big box" };
    const { GET, POST } = await import("@/app/api/kroger/cart/route");
    const review = await bodyOf(await GET());
    const match = review.lines[1].plan.product;
    const body = await bodyOf(
      await POST(
        new NextRequest("https://cookbook.techpaddock.io/api/kroger/cart", {
          method: "POST",
          body: JSON.stringify({ picks: [{ id: "b", upc: match.upc, match: match.url }] }),
        })
      )
    );
    expect(body.outcomes[1]).toMatchObject({ result: "added", detail: "Added ×1. Remembered in Your brands." });
    // TEC-131: the line's name goes on that product (or a new row), and its count goes up.
    expect(mem.saved).toEqual([{ name: "eggs", upc: "0001111041700", page: "https://www.kingsoopers.com/p/kroger-2-milk/0001111041700", size: null }]);
    expect(mem.bumps).toEqual([["0001111041700"]]);
    // No model anywhere in this flow: Kroger is the only host called.
    expect(kroger.mock.calls.every(([u]) => String(u).startsWith("https://api.kroger.com/"))).toBe(true);
  });

  it("a failed add remembers nothing (TEC-128)", async () => {
    kroger.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/connect/oauth2/token")) return json({ access_token: ACCESS, refresh_token: NEW_RT });
      if (url.endsWith("/cart/add")) return json({ errors: { reason: "down" } }, 500);
      return json({ data: [PRODUCT] });
    });
    try {
      const { POST } = await import("@/app/api/kroger/cart/route");
      const body = await bodyOf(
        await POST(
          new NextRequest("https://cookbook.techpaddock.io/api/kroger/cart", {
            method: "POST",
            body: JSON.stringify({ picks: [{ id: "b", url: "https://www.kingsoopers.com/p/fairlife-2-milk/0085631200203" }] }),
          })
        )
      );
      expect(body.outcomes[1].result).toBe("failed");
      expect(mem.saved).toEqual([]);
    } finally {
      kroger.mockImplementation(defaultKroger);
    }
  });

  it("the refresh", async () => {
    const { POST } = await import("@/app/api/kroger/refresh/route");
    const body = await bodyOf(await POST());
    expect(body.report.updated).toEqual(["milk"]);
    expect(body.refreshedAt).toBeTruthy();
    // Refreshing turned the token over, and stored the new one sealed.
    expect(open(String(mem.row?.refresh_token_sealed), key())).toBe(NEW_RT);
  });

  it("a refused sign-in is an error in words, with no token in it", async () => {
    kroger.mockImplementationOnce(async () => json({ error: "invalid_grant" }, 400));
    const { POST } = await import("@/app/api/kroger/refresh/route");
    const res = await POST();
    expect(res.status).toBe(502);
    const body = await bodyOf(res);
    expect(body.error).toMatch(/connect King Soopers again/);
    expect(body.reconnect).toBe(true);
  });
});

describe("prices on the list tab (TEC-121)", () => {
  const secrets = () => [STORED_RT, NEW_RT, ACCESS, CLIENT_SECRET, String(mem.row?.refresh_token_sealed ?? "never")];
  async function bodyOf(res: Response) {
    const text = await res.text();
    for (const secret of secrets()) expect(text).not.toContain(secret);
    return JSON.parse(text);
  }
  const onSale = { ...PRODUCT, items: [{ size: "1 gal", price: { regular: 4, promo: 3, expirationDate: { value: "2026-10-27T23:59:59Z" } } }] };

  afterEach(() => {
    kroger.mockImplementation(defaultKroger);
  });

  it("Pickup or Delivery is remembered on the connection, and anything else is refused", async () => {
    const { GET, PATCH } = await import("@/app/api/kroger/route");
    expect((await bodyOf(await GET())).modality).toBe("PICKUP");
    const patch = (modality: unknown) =>
      PATCH(new NextRequest("https://cookbook.techpaddock.io/api/kroger", { method: "PATCH", body: JSON.stringify({ modality }) }));
    expect((await patch("SHIP")).status).toBe(400);
    expect((await bodyOf(await patch("DELIVERY"))).modality).toBe("DELIVERY");
    expect((await bodyOf(await GET())).modality).toBe("DELIVERY");
  });

  it("Send puts the chosen mode on the cart body", async () => {
    mem.row = { ...mem.row, modality: "DELIVERY" };
    const { POST } = await import("@/app/api/kroger/cart/route");
    const body = await bodyOf(
      await POST(
        new NextRequest("https://cookbook.techpaddock.io/api/kroger/cart", {
          method: "POST",
          body: JSON.stringify({ picks: [{ id: "a", upc: "0001111041700" }] }),
        })
      )
    );
    expect(body.modalityWarning).toBeNull();
    const cartCall = kroger.mock.calls.find(([url]) => String(url).endsWith("/cart/add"));
    expect(JSON.parse(String((cartCall?.[1] as RequestInit).body))).toEqual({
      items: [{ upc: "0001111041700", quantity: 2, modality: "DELIVERY" }],
    });
  });

  it("Send retries without the mode when Kroger refuses it, and warns", async () => {
    kroger.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/connect/oauth2/token")) return json({ access_token: ACCESS, refresh_token: NEW_RT });
      if (url.endsWith("/cart/add")) {
        return String(init?.body).includes("modality") ? json({ errors: { reason: "invalid field" } }, 400) : new Response(null, { status: 204 });
      }
      return json({ data: [PRODUCT] });
    });
    const { POST } = await import("@/app/api/kroger/cart/route");
    const body = await bodyOf(
      await POST(
        new NextRequest("https://cookbook.techpaddock.io/api/kroger/cart", {
          method: "POST",
          body: JSON.stringify({ picks: [{ id: "a", upc: "0001111041700" }] }),
        })
      )
    );
    expect(body.outcomes[0]).toMatchObject({ result: "added", withoutModality: true });
    expect(body.modalityWarning).toMatch(/refused the pickup choice/);
    expect(mem.sent).toEqual(["a"]);
  });

  it("the estimate prices the list at the store, asking for the exact brands by ID", async () => {
    const { POST } = await import("@/app/api/kroger/estimate/route");
    const body = await bodyOf(await POST());
    // milk ×2 (exact brand) and eggs ×1 (top match), both $3.49 in the fake.
    expect(body.estimate.total).toBe(10.47);
    expect(body.message).toMatch(/^Estimated total \$10\.47 for 2 lines, pickup at King Soopers Test/);
    const productCalls = kroger.mock.calls.map(([u]) => decodeURIComponent(String(u))).filter((u) => u.includes("/products"));
    expect(productCalls.some((u) => u.includes("filter.productId=0001111041700") && u.includes("filter.locationId=62000001"))).toBe(true);
    expect(mem.scans).toEqual([]);
  });

  it("a deal scan is appended, never overwritten, and the latest is what GET shows", async () => {
    kroger.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/connect/oauth2/token")) return json({ access_token: ACCESS, refresh_token: NEW_RT });
      return json({ data: [onSale] });
    });
    const { GET, POST } = await import("@/app/api/kroger/deals/route");
    expect((await bodyOf(await GET())).latest).toBeNull();
    const run = () => POST(new NextRequest("https://cookbook.techpaddock.io/api/kroger/deals", { method: "POST", body: "{}" }));
    const first = await bodyOf(await run());
    expect(first.scan.trigger).toBe("manual");
    expect(first.scan.deals).toEqual([
      expect.objectContaining({ productId: "0001111041700", regular: 4, promo: 3, percentOff: 25, for: ["milk", "eggs"] }),
    ]);
    // The saved brand, then the two open lines.
    expect(first.message).toBe("Checked 3 at King Soopers Test: 1 on sale.");
    await bodyOf(await run());
    expect(mem.scans.map((s) => s.id)).toEqual(["scan-1", "scan-2"]);
    expect((await bodyOf(await GET())).latest.id).toBe("scan-2");
  });

  it("without a store, the scan and the estimate say so and save nothing", async () => {
    mem.row = { ...mem.row, location_id: null, store_name: null };
    const deals = await import("@/app/api/kroger/deals/route");
    const est = await import("@/app/api/kroger/estimate/route");
    const scan = await deals.POST(new NextRequest("https://cookbook.techpaddock.io/api/kroger/deals", { method: "POST", body: "{}" }));
    expect(scan.status).toBe(409);
    expect((await bodyOf(scan)).error).toMatch(/Pick a store/);
    expect((await est.POST()).status).toBe(409);
    expect(mem.scans).toEqual([]);
  });
});

describe("Take back (TEC-127)", () => {
  const secrets = () => [STORED_RT, NEW_RT, ACCESS, CLIENT_SECRET, String(mem.row?.refresh_token_sealed ?? "never")];
  async function bodyOf(res: Response) {
    const text = await res.text();
    for (const secret of secrets()) expect(text).not.toContain(secret);
    return JSON.parse(text);
  }
  const cartBodies = () =>
    kroger.mock.calls.filter(([url]) => String(url).endsWith("/cart/add")).map(([, init]) => JSON.parse(String((init as RequestInit).body)));
  const takeBackPost = async (body: unknown) => {
    const { POST } = await import("@/app/api/kroger/cart/take-back/route");
    return POST(new NextRequest("https://cookbook.techpaddock.io/api/kroger/cart/take-back", { method: "POST", body: JSON.stringify(body) }));
  };

  it("a send records the product, quantity and mode that went in", async () => {
    mem.row = { ...mem.row, modality: "DELIVERY" };
    const { POST } = await import("@/app/api/kroger/cart/route");
    const body = await bodyOf(
      await POST(
        new NextRequest("https://cookbook.techpaddock.io/api/kroger/cart", {
          method: "POST",
          body: JSON.stringify({ picks: [{ id: "a", upc: "0001111041700" }] }),
        })
      )
    );
    expect(body.recordError).toBeNull();
    expect(mem.ledger).toEqual([{ item_id: "a", name: "milk", kind: "sent", upc: "0001111041700", quantity: 2, modality: "DELIVERY" }]);
  });

  it("takes back what was sent — not the line's quantity now — with the same mode, after a confirm, and marks it unsent", async () => {
    mem.list[0].sent_at = "2026-10-21T01:00:00Z";
    mem.list[0].quantity = 5; // changed since the send
    mem.ledger = [{ item_id: "a", name: "milk", kind: "sent", upc: "0001111041700", quantity: 2, modality: "PICKUP" }];

    const { GET } = await import("@/app/api/kroger/cart/take-back/route");
    const preview = await bodyOf(await GET());
    expect(preview.lines).toEqual([
      { id: "a", name: "milk", sent_at: "2026-10-21T01:00:00Z", held: [{ upc: "0001111041700", quantity: 2, modality: "PICKUP" }] },
    ]);
    expect(cartBodies()).toEqual([]);

    // The first tap alone takes nothing.
    const unconfirmed = await takeBackPost({});
    expect(unconfirmed.status).toBe(400);
    expect(cartBodies()).toEqual([]);

    const body = await bodyOf(await takeBackPost({ confirm: true }));
    expect(cartBodies()).toEqual([{ items: [{ upc: "0001111041700", quantity: -2, modality: "PICKUP" }] }]);
    expect(body.outcomes).toEqual([{ id: "a", name: "milk", result: "taken back", detail: "Took back ×2." }]);
    expect(body.summary).toBe("1 taken back, 0 skipped, 0 failed. Anything added to the cart elsewhere is still there.");
    expect(body.failed).toBe(false);
    expect(mem.unsent).toEqual(["a"]);
    expect(mem.ledger.at(-1)).toMatchObject({ kind: "taken_back", quantity: -2, modality: "PICKUP" });
  });

  it("when Kroger refuses a negative quantity, the line fails, stays sent, and the panel offers the cart page", async () => {
    kroger.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/connect/oauth2/token")) return json({ access_token: ACCESS, refresh_token: NEW_RT });
      if (url.endsWith("/cart/add")) return json({ errors: { reason: "quantity must be positive" } }, 400);
      return json({ data: [PRODUCT] });
    });
    mem.list[0].sent_at = "2026-10-21T01:00:00Z";
    mem.ledger = [{ item_id: "a", name: "milk", kind: "sent", upc: "0001111041700", quantity: 2, modality: "PICKUP" }];

    const body = await bodyOf(await takeBackPost({ confirm: true }));
    expect(body.outcomes[0]).toMatchObject({ result: "failed", detail: expect.stringMatching(/Still marked sent/) });
    expect(body.failed).toBe(true);
    expect(body.checkoutUrl).toBe("https://www.kingsoopers.com/cart");
    expect(mem.unsent).toEqual([]);
    // Not retried without the mode.
    expect(cartBodies()).toHaveLength(1);
    // The reservation was reversed, so a later Take back still finds the milk.
    const { GET } = await import("@/app/api/kroger/cart/take-back/route");
    expect((await bodyOf(await GET())).lines[0].held).toEqual([{ upc: "0001111041700", quantity: 2, modality: "PICKUP" }]);
  });

  it("a line sent before the ledger is skipped without asking Kroger, and an empty list says so", async () => {
    mem.list[1].sent_at = "2026-10-01T00:00:00Z";
    const body = await bodyOf(await takeBackPost({ confirm: true }));
    expect(body.outcomes).toEqual([expect.objectContaining({ id: "b", result: "skipped" })]);
    expect(kroger).not.toHaveBeenCalled();

    mem.list[1].sent_at = null;
    const none = await takeBackPost({ confirm: true });
    expect(none.status).toBe(400);
    expect((await bodyOf(none)).error).toMatch(/hasn't sent anything/);
  });
});
