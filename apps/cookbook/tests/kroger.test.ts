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
  tokenWrites: [] as string[],
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
  deleteConnectionRow: async () => {
    mem.row = null;
  },
  readBrandProducts: async () => mem.products,
  writeBrandProduct: async (r: Record<string, unknown>) => {
    mem.products = [...mem.products.filter((p) => p.preference_id !== r.preference_id), r];
  },
}));

vi.mock("@/lib/grocery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/grocery")>()),
  readList: async () => mem.list,
  markSent: async (ids: string[]) => {
    mem.sent.push(...ids);
  },
}));

vi.mock("@/lib/preferences", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/preferences")>()),
  readPreferences: async () => mem.prefs,
  savePreference: async (draft: Record<string, unknown>) => ({ id: "new", ...draft }),
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
const kroger = vi.fn(async (input: string | URL | Request) => {
  const url = String(input);
  if (url.endsWith("/connect/oauth2/token")) return json({ access_token: ACCESS, refresh_token: NEW_RT, expires_in: 1800 });
  if (url.includes("/locations")) {
    return json({ data: [{ locationId: "62000001", name: "King Soopers Test", address: { addressLine1: "1 Main St", city: "Denver", state: "CO", zipCode: "80202" } }] });
  }
  if (url.includes("/products")) return json({ data: [PRODUCT] });
  if (url.endsWith("/cart/add")) return new Response(null, { status: 204 });
  return json({ error: "unexpected" }, 500);
});

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
  mem.prefs = [
    {
      id: "p1",
      phrase: "milk",
      kind: "product",
      url: "https://www.kingsoopers.com/p/kroger-2-milk/0001111041700",
      terms: null,
      brand: null,
      note: null,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    },
  ];
  mem.sent = [];
  mem.tokenWrites = [];
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
