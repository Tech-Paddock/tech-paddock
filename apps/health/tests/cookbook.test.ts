import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Health's side of the Cookbook read contract (TEC-25): the cookie rule, the
 * fixed origin, "down is never not found", and the lookup order. Invented food
 * only — guardrail 4.
 */

// resolveItem's other tiers, so the order is observable without a database.
const findItem = vi.fn();
const estimateMacros = vi.fn();
vi.mock("@/lib/items", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/items")>();
  return { ...real, findItem: (...a: unknown[]) => findItem(...a) };
});
vi.mock("@/lib/anthropic", () => ({ estimateMacros: (...a: unknown[]) => estimateMacros(...a) }));

import {
  fetchServings, recipeBook, recipeBookFor, matchRecipe, parseServings, cookbookOrigin, isRecipe, findRecipe,
  CookbookUnreachable, AmbiguousRecipe, DEFAULT_COOKBOOK_BASE_URL, type Recipe,
} from "@/lib/cookbook";
import { LookupError, type ItemVersion } from "@/lib/items";
import { decideLine, decideRecipeLine, type ApprovedLine } from "@/lib/approve";
import { resolveItem } from "@/lib/log";

const CHILI = { kcal: 410, protein_g: 31, carbs_g: 38, fat_g: 14 };
const BOOK = { recipes: [{ id: "r1", name: "Turkey chili", servings: 6, per_serving: CHILI }] };

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

type Call = { url: string; init: RequestInit };
function recorder(response: () => Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return response();
  };
  return { calls, fetchImpl };
}

describe("the cookie rule", () => {
  it("forwards only paddock_session, to the fixed origin's /api/servings", async () => {
    const { calls, fetchImpl } = recorder(async () => ok(BOOK));
    await fetchServings({ session: "signed.value", env: {}, fetchImpl });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${DEFAULT_COOKBOOK_BASE_URL}/api/servings`);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.cookie).toBe("paddock_session=signed.value");
    expect(Object.keys(headers).sort()).toEqual(["accept", "cookie"]);
    // A redirect to /login must not be followed into a 200 of HTML.
    expect(calls[0].init.redirect).toBe("manual");
  });

  it("reads the session cookie by name and never the rest of the jar", async () => {
    const jar = new Map([
      ["paddock_session", { value: "the-session" }],
      ["paddock_attempts", { value: "3" }],
      ["other", { value: "secret" }],
    ]);
    const asked: string[] = [];
    const cookies = { get: (name: string) => { asked.push(name); return jar.get(name); } };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok(BOOK));
    try {
      await recipeBookFor(cookies).find("turkey chili");
      expect(asked).toEqual(["paddock_session"]);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${cookbookOrigin()}/api/servings`);
      expect((init.headers as Record<string, string>).cookie).toBe("paddock_session=the-session");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("keeps only the origin of COOKBOOK_BASE_URL, so a path cannot change the route", () => {
    expect(cookbookOrigin({ COOKBOOK_BASE_URL: "https://cookbook.example.test/evil?x=1" }))
      .toBe("https://cookbook.example.test");
    expect(cookbookOrigin({})).toBe(DEFAULT_COOKBOOK_BASE_URL);
  });

  it("refuses a plain-http origin other than localhost", () => {
    expect(() => cookbookOrigin({ COOKBOOK_BASE_URL: "http://cookbook.example.test" })).toThrow(CookbookUnreachable);
    expect(cookbookOrigin({ COOKBOOK_BASE_URL: "http://localhost:3005" })).toBe("http://localhost:3005");
  });

  it("sends nothing without a session", async () => {
    const { calls, fetchImpl } = recorder(async () => ok(BOOK));
    await expect(fetchServings({ session: null, env: {}, fetchImpl })).rejects.toThrow(CookbookUnreachable);
    expect(calls).toHaveLength(0);
  });
});

describe("down is never 'not found'", () => {
  const failures: [string, () => Promise<Response>][] = [
    ["a 401", async () => new Response("{}", { status: 401 })],
    ["a 500", async () => new Response("{}", { status: 500 })],
    ["a 503", async () => new Response("{}", { status: 503 })],
    ["a 404", async () => new Response("{}", { status: 404 })],
    ["a redirect to /login", async () => new Response(null, { status: 307, headers: { location: "/login" } })],
    ["a body that is not JSON", async () => new Response("<html>", { status: 200 })],
    ["a body without the recipe list", async () => ok({ error: "nope" })],
    ["a recipe without numbers", async () => ok({ recipes: [{ id: "r", name: "Stew", per_serving: null }] })],
    ["a network failure", async () => { throw new TypeError("fetch failed"); }],
  ];

  for (const [what, response] of failures) {
    it(`${what} is CookbookUnreachable, a LookupError`, async () => {
      const { fetchImpl } = recorder(response);
      const error = await fetchServings({ session: "s", env: {}, fetchImpl }).catch((e) => e);
      expect(error).toBeInstanceOf(CookbookUnreachable);
      expect(error).toBeInstanceOf(LookupError);
      expect(error.message).toMatch(/^Couldn't reach the Cookbook/);
      expect(error.message).not.toMatch(/not found/i);
    });
  }

  it("a timeout is CookbookUnreachable", async () => {
    const fetchImpl = (_url: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    const error = await fetchServings({ session: "s", env: {}, fetchImpl, timeoutMs: 10 }).catch((e) => e);
    expect(error).toBeInstanceOf(CookbookUnreachable);
    expect(error.message).toMatch(/did not answer in time/);
  });

  it("only a 200 with the contract's shape can say a name is not a recipe", async () => {
    const { fetchImpl } = recorder(async () => ok({ recipes: [] }));
    const book = recipeBook(() => fetchServings({ session: "s", env: {}, fetchImpl }));
    await expect(book.find("turkey chili")).resolves.toBeNull();
  });

  it("an unreachable Cookbook is not 'not a recipe' for a name stored from it", async () => {
    const book = recipeBook(async () => { throw new CookbookUnreachable("test"); });
    await expect(findRecipe(book, "Turkey chili", async () => true)).rejects.toThrow(CookbookUnreachable);
  });
});

describe("matching a recipe", () => {
  const recipes: Recipe[] = parseServings(BOOK);

  it("matches on the normalised name, deterministically", () => {
    expect(matchRecipe(recipes, "  TURKEY   chili.")?.id).toBe("r1");
    expect(matchRecipe(recipes, "turkey")).toBeNull();
  });

  it("refuses two recipes it cannot tell apart", () => {
    const twice = [...recipes, { id: "r2", name: "Turkey Chili!", per_serving: CHILI }];
    expect(() => matchRecipe(twice, "turkey chili")).toThrow(AmbiguousRecipe);
  });

  it("reads the book once per request", async () => {
    const read = vi.fn(async () => recipes);
    const book = recipeBook(read);
    await book.find("turkey chili");
    await book.find("toast");
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe("the lookup order", () => {
  beforeEach(() => {
    findItem.mockReset();
    estimateMacros.mockReset();
  });

  const stored: ItemVersion = {
    id: "v1", item_id: "item-chili", kcal: 380, protein_g: 28, carbs_g: 35, fat_g: 12,
    kind: "correction", effective_from: "2026-09-01", source: "hand", model: null,
    source_url: null, note: null, created_at: "2026-09-01T12:00:00Z",
  };

  it("asks the Cookbook before Health's own table", async () => {
    findItem.mockResolvedValue({ item: { id: "item-chili" }, versions: [stored] });
    const line = await resolveItem({
      name: "Turkey chili", quantity: 1, onDate: "2026-09-26",
      recipes: recipeBook(async () => parseServings(BOOK)),
    });
    expect(line.source).toBe("cookbook");
    expect(line.model).toBeNull();
    expect(line.macros).toEqual(CHILI);
    expect(line.item_id).toBe("item-chili");
    expect(estimateMacros).not.toHaveBeenCalled();
  });

  const outage = () => recipeBook(async () => { throw new CookbookUnreachable("test"); });

  it("an outage refuses a known recipe on its line, never falling through", async () => {
    findItem.mockResolvedValue({
      item: { id: "item-chili" },
      versions: [stored, { ...stored, id: "v2", source: "cookbook", created_at: "2026-09-20T12:00:00Z" }],
    });
    const line = await resolveItem({ name: "Turkey chili", quantity: 1, onDate: "2026-09-26", recipes: outage() });
    expect(line.error).toMatch(/^Couldn't reach the Cookbook/);
    expect(line.source).toBe("cookbook");
    expect(line.macros).toEqual({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
    expect(estimateMacros).not.toHaveBeenCalled();
  });

  it("an outage lets an ordinary food resolve as normal", async () => {
    findItem.mockResolvedValue({ item: { id: "item-eggs" }, versions: [{ ...stored, item_id: "item-eggs" }] });
    const line = await resolveItem({ name: "Two eggs", quantity: 1, onDate: "2026-09-26", recipes: outage() });
    expect(line.error).toBeNull();
    expect(line.source).toBe("hand");
  });

  it("an outage lets a never-seen food go outside as normal", async () => {
    findItem.mockResolvedValue(null);
    estimateMacros.mockResolvedValue({ macros: CHILI, source_url: null, note: null });
    const line = await resolveItem({ name: "Oat bar", quantity: 1, onDate: "2026-09-26", recipes: outage() });
    expect(line.error).toBeNull();
    expect(line.source).toBe("estimate");
  });

  it("the refusal checks follow the same rule during an outage", async () => {
    await expect(isRecipe(outage(), "Turkey chili", async () => true)).rejects.toThrow(CookbookUnreachable);
    await expect(isRecipe(outage(), "Two eggs", async () => false)).resolves.toBe(false);
  });

  it("a name that is not a recipe goes on to the table as before", async () => {
    findItem.mockResolvedValue({ item: { id: "item-chili" }, versions: [stored] });
    const line = await resolveItem({
      name: "Two eggs", quantity: 1, onDate: "2026-09-26",
      recipes: recipeBook(async () => parseServings(BOOK)),
    });
    expect(line.source).toBe("hand");
    expect(findItem).toHaveBeenCalledWith("Two eggs");
  });
});

describe("approving a recipe line", () => {
  function line(over: Partial<ApprovedLine> = {}): ApprovedLine {
    return {
      name: "Turkey chili", macros: CHILI, source: "cookbook", model: null,
      source_url: null, note: null, item_id: "item-chili", ...over,
    };
  }
  const cookbookVersion: ItemVersion = {
    id: "v2", item_id: "item-chili", ...CHILI, kind: "change", effective_from: "2026-09-20",
    source: "cookbook", model: null, source_url: null, note: null, created_at: "2026-09-20T12:00:00Z",
  };

  it("refuses a typed-over number with 'fix it in the Cookbook'", () => {
    const d = decideRecipeLine(line({ source: "hand", macros: { ...CHILI, kcal: 300 } }), "item-chili", cookbookVersion, CHILI);
    expect(d).toMatchObject({ action: "reject" });
    expect(d.action === "reject" && d.reason).toMatch(/Fix it in the Cookbook/);
  });

  it("refuses a draft whose Cookbook numbers moved since the lookup", () => {
    expect(decideRecipeLine(line(), "item-chili", cookbookVersion, { ...CHILI, kcal: 450 })).toMatchObject({ action: "reject" });
  });

  it("first time: the recipe becomes an item with a cookbook version and no model", () => {
    expect(decideRecipeLine(line({ item_id: null }), null, null, CHILI))
      .toEqual({ action: "first", source: "cookbook", model: null, source_url: null, note: null });
  });

  it("unchanged: snapshots the stored cookbook version", () => {
    expect(decideRecipeLine(line(), "item-chili", cookbookVersion, CHILI)).toEqual({ action: "reuse", version: cookbookVersion });
  });

  it("changed in the Cookbook, or last stored by hand: appends a cookbook version", () => {
    expect(decideRecipeLine(line(), "item-chili", { ...cookbookVersion, kcal: 380 }, CHILI)).toEqual({ action: "cookbook" });
    expect(decideRecipeLine(line(), "item-chili", { ...cookbookVersion, source: "hand" }, CHILI)).toEqual({ action: "cookbook" });
  });

  it("a cookbook line whose recipe has gone is refused, not stored without a model", () => {
    expect(decideLine(line(), "item-chili", cookbookVersion)).toMatchObject({ action: "reject" });
    expect(decideLine(line({ item_id: null }), null, null)).toMatchObject({ action: "reject" });
  });
});
