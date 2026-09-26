import { COOKIES } from "./auth";
import { LookupError, normalizeName } from "./items";
import { parseMacros, type Macros } from "./macros";

/**
 * Reading a recipe's macros from the Cookbook (TEC-25).
 *
 * **The contract is Cookbook's, in its charter** — `GET /api/servings`, every
 * recipe per serving. This file is Health's side of it and holds nothing the
 * contract does not say.
 *
 * Three rules, each tested in `tests/cookbook.test.ts`:
 *
 * - **Only `paddock_session` is forwarded, and only to `COOKBOOK_BASE_URL`.**
 *   Never the whole cookie header, never a URL taken from the request. The
 *   origin is read from the environment and the path is fixed here, so nothing
 *   a caller sends can point this at another host.
 * - **Down is never "not found"** — guardrail 2. A timeout, a redirect, a 401,
 *   a 5xx, or a body that is not the contract's shape is `CookbookUnreachable`,
 *   a `LookupError`, so every route already surfaces it as a 503 and nothing
 *   falls through to Health's table or to a model. Only a 200 with the
 *   contract's shape can say a name is not a recipe.
 * - **One read per request.** `recipeBook` memoises, so a draft of five foods
 *   is one call, not five.
 */

export const DEFAULT_COOKBOOK_BASE_URL = "https://cookbook.techpaddock.io";

/** Long enough for a cold start, short enough that a stuck Cookbook is named rather than waited on. */
export const COOKBOOK_TIMEOUT_MS = 8000;

export type Recipe = { id: string; name: string; per_serving: Macros };

const UNREACHABLE = "Couldn't reach the Cookbook";

export class CookbookUnreachable extends LookupError {
  constructor(detail: string) {
    super(`${UNREACHABLE} (${detail}), so nothing was looked up. Try again in a moment.`);
    this.name = "CookbookUnreachable";
  }
}

/** Two recipes the lookup cannot tell apart. The line's problem, not a broken Cookbook. */
export class AmbiguousRecipe extends Error {
  constructor(name: string, matches: string[]) {
    super(`"${name}" matches more than one Cookbook recipe (${matches.map((m) => `"${m}"`).join(", ")}). Rename one in the Cookbook.`);
    this.name = "AmbiguousRecipe";
  }
}

/**
 * The fixed origin. `COOKBOOK_BASE_URL` is read from the environment only — a
 * deployment setting, never a request field — and only its origin is kept, so
 * a path or query in it cannot change which route is called. `https` always;
 * plain `http` only to localhost, for development.
 */
export function cookbookOrigin(env: Record<string, string | undefined> = process.env): string {
  const raw = env.COOKBOOK_BASE_URL?.trim() || DEFAULT_COOKBOOK_BASE_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CookbookUnreachable("COOKBOOK_BASE_URL is not a URL");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new CookbookUnreachable("COOKBOOK_BASE_URL must be https");
  }
  return url.origin;
}

export function servingsUrl(env?: Record<string, string | undefined>): string {
  return `${cookbookOrigin(env)}/api/servings`;
}

/**
 * The contract's body, or `CookbookUnreachable`. A recipe without a usable
 * name or per-serving numbers makes the whole answer untrustworthy rather than
 * one line missing — a skipped recipe would read as "not a recipe" and send
 * that line to Health's table, which is the fall-through guardrail 2 forbids.
 */
export function parseServings(body: unknown): Recipe[] {
  const list = (body as { recipes?: unknown } | null)?.recipes;
  if (!Array.isArray(list)) throw new CookbookUnreachable("its answer had no recipe list");
  return list.map((raw) => {
    const r = raw as { id?: unknown; name?: unknown; per_serving?: unknown };
    const per_serving = parseMacros(r?.per_serving);
    if (typeof r?.name !== "string" || !normalizeName(r.name) || !per_serving) {
      throw new CookbookUnreachable("a recipe in its answer had no usable numbers");
    }
    return { id: String(r.id ?? ""), name: r.name, per_serving };
  });
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** One read of the book, forwarding one cookie. */
export async function fetchServings(params: {
  session: string | null | undefined;
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<Recipe[]> {
  // Middleware admits no request here without a session, so a missing one is
  // a broken request rather than an empty book.
  if (!params.session) throw new CookbookUnreachable("no session to forward");

  const url = servingsUrl(params.env);
  const doFetch = params.fetchImpl ?? ((u: string, i: RequestInit) => fetch(u, i));

  let response: Response;
  try {
    response = await doFetch(url, {
      method: "GET",
      // The one cookie, by name. Never the incoming Cookie header.
      headers: { cookie: `${COOKIES.SESSION}=${params.session}`, accept: "application/json" },
      // A signed-out Cookbook redirects pages to /login; following it would
      // turn "not signed in" into a 200 of HTML.
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(params.timeoutMs ?? COOKBOOK_TIMEOUT_MS),
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new CookbookUnreachable(timedOut ? "it did not answer in time" : "the request failed");
  }

  if (response.status !== 200) {
    throw new CookbookUnreachable(
      response.status === 401 ? "it did not accept the session" : `it answered ${response.status || "a redirect"}`
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new CookbookUnreachable("its answer was not JSON");
  }
  return parseServings(body);
}

/**
 * The recipe a food's name names, or null when the book has none by that name.
 * Deterministic: the normalised name equals a recipe's normalised name. No
 * model decides it, and no near match — a wrong guess would swap one food's
 * numbers for another's.
 */
export function matchRecipe(recipes: Recipe[], name: string): Recipe | null {
  const key = normalizeName(name);
  const matches = recipes.filter((r) => normalizeName(r.name) === key);
  if (matches.length > 1) throw new AmbiguousRecipe(name, matches.map((m) => m.name));
  return matches[0] ?? null;
}

export type RecipeBook = { find(name: string): Promise<Recipe | null> };

/** A request's view of the book: read at most once, on first use. */
export function recipeBook(read: () => Promise<Recipe[]>): RecipeBook {
  let pending: Promise<Recipe[]> | null = null;
  return {
    async find(name) {
      pending ??= read();
      return matchRecipe(await pending, name);
    },
  };
}

/**
 * Whether a name is the Cookbook's to answer — two recipes of one name
 * included. Used to refuse a Health-side number for a recipe, which the next
 * log would bypass; an unreachable Cookbook still throws.
 */
export async function isRecipe(book: RecipeBook, name: string): Promise<boolean> {
  try {
    return (await book.find(name)) !== null;
  } catch (e) {
    if (e instanceof AmbiguousRecipe) return true;
    throw e;
  }
}

export function fixItInTheCookbook(name: string): string {
  return `"${name}" is a Cookbook recipe, so its numbers aren't changed here. Fix it in the Cookbook.`;
}

type CookieJar ={ get(name: string): { value: string } | undefined };

/** The book as the caller of this request may read it, forwarding their session only. */
export function recipeBookFor(cookies: CookieJar): RecipeBook {
  const session = cookies.get(COOKIES.SESSION)?.value ?? null;
  return recipeBook(() => fetchServings({ session }));
}
