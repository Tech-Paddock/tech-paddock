import { keyProblem, readKey } from "./krogerCrypto";
import { SetupError, UpstreamError } from "./errors";
import type { Modality } from "./modality";

/**
 * Kroger's public API, as this app uses it (TEC-90). **Server-side only.**
 *
 * Four things and no more: sign in once (OAuth2 Authorization Code), find
 * the store (Locations), look a line up at that store (Products), and add to the
 * cart (Cart — which only adds: it cannot read the cart and cannot check out).
 * **No model call anywhere**; Kroger's own search picks the top match and the user
 * confirms it.
 *
 * **Provenance, because none of this could be loaded from here.** The base URL,
 * the two OAuth paths and the scope names are the ones the TEC-90 brief and
 * design give, and a search on 2026-10-20 agreed with them; `developer.kroger.com`
 * itself is refused by this project's egress, so the request and response shapes
 * below are from Kroger's published examples as they were known, not read live.
 * Each is one constant or one parser, so a wrong guess is a small fix, and the
 * tests mock Kroger entirely. The first real check is connecting on
 * production.
 *
 * **Since 2026-10-20 the product side is confirmed** on a test app (TEC-121):
 * Basic auth on the token route, the chain filter, several IDs per
 * `filter.productId`, `price.regular` and `price.promo` with dates, stock,
 * fulfilment flags, the product page. The cart body, with or without
 * `modality`, still is not: an app token is refused there.
 *
 * **Tokens never leave this file except to Kroger or into `krogerCrypto.seal`.**
 * No function here returns one to a route, and no error message carries one:
 * Kroger's error bodies are reduced to their `error` code before they are quoted.
 */

export const KROGER_API = "https://api.kroger.com/v1";
export const AUTHORIZE_URL = `${KROGER_API}/connect/oauth2/authorize`;
export const TOKEN_URL = `${KROGER_API}/connect/oauth2/token`;

/**
 * Exactly what is registered with Kroger. **Never built from the request**: a
 * redirect URI taken from a Host header is how an OAuth code gets sent somewhere
 * else. It is a page route, not under `/api/`, so an expired session bounces
 * through the login rather than answering 401 (`proxy.ts`, unchanged).
 */
export const REDIRECT_URI = "https://cookbook.techpaddock.io/kroger/callback";

/**
 * `cart.basic:write` to add, `product.compact` to look a line up. No
 * `profile.compact`: nothing here needs to know who the user is at Kroger.
 */
export const SCOPES = "cart.basic:write product.compact";

export type KrogerConfig = { clientId: string; clientSecret: string; key: Buffer };

/**
 * Which of the three variables is missing or unusable, in words. **The list tab
 * shows these**, so a deployment without them says why Send to cart is not there
 * rather than failing on a tap.
 */
export function configProblems(env: Record<string, string | undefined> = process.env): string[] {
  const problems: string[] = [];
  if (!env.KROGER_CLIENT_ID) problems.push("KROGER_CLIENT_ID is not set");
  if (!env.KROGER_CLIENT_SECRET) problems.push("KROGER_CLIENT_SECRET is not set");
  const key = keyProblem(env.KROGER_TOKEN_KEY);
  if (key) problems.push(key);
  return problems;
}

export class KrogerConfigError extends SetupError {
  constructor(public problems: string[]) {
    super(`Send to cart isn't set up on this deployment: ${problems.join("; ")}.`);
    this.name = "KrogerConfigError";
  }
}

export function krogerConfig(env: Record<string, string | undefined> = process.env): KrogerConfig {
  const problems = configProblems(env);
  if (problems.length > 0) throw new KrogerConfigError(problems);
  return {
    clientId: env.KROGER_CLIENT_ID as string,
    clientSecret: env.KROGER_CLIENT_SECRET as string,
    key: readKey(env.KROGER_TOKEN_KEY),
  };
}

/**
 * Kroger said no, or did not answer. `status` is Kroger's, or 0 for no answer.
 * `reconnect` is true when the stored sign-in is what failed, so the list tab can
 * say "connect again" rather than "try again".
 */
export class KrogerError extends UpstreamError {
  constructor(message: string, public status: number, reconnect = false) {
    super(message, reconnect);
    this.name = "KrogerError";
  }
}

export function authorizeUrl(config: Pick<KrogerConfig, "clientId">, state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("state", state);
  return url.toString();
}

/** Kroger's error body, reduced to its code. Never the body itself — see the header. */
async function errorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    const code = body.error ?? (body.errors as Record<string, unknown> | undefined)?.reason;
    return typeof code === "string" && /^[\w .:-]{1,80}$/.test(code) ? code : `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

async function call(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new KrogerError("Couldn't reach Kroger.", 0);
  }
}

export type Tokens = { accessToken: string; refreshToken: string | null };

async function token(config: KrogerConfig, form: Record<string, string>, failure: string): Promise<Tokens> {
  const response = await call(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams(form).toString(),
  });
  if (!response.ok) {
    const code = await errorCode(response);
    // A refused grant is the stored sign-in going stale; anything else is Kroger.
    throw new KrogerError(`${failure} (${code}).`, response.status, response.status === 400 || response.status === 401);
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new KrogerError(`${failure} (no access token came back).`, response.status);
  }
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : null,
  };
}

/** The callback's half: a one-time code for the first pair of tokens. */
export function exchangeCode(config: KrogerConfig, code: string): Promise<Tokens> {
  return token(config, { grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI }, "Kroger refused the sign-in");
}

/**
 * A fresh access token from the stored refresh token. **Kroger may hand back a
 * new refresh token too**, and when it does the caller must store it — the old
 * one may stop working.
 */
export function refresh(config: KrogerConfig, refreshToken: string): Promise<Tokens> {
  return token(config, { grant_type: "refresh_token", refresh_token: refreshToken }, "Kroger refused the stored sign-in — connect King Soopers again");
}

function bearer(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export type Store = { locationId: string; name: string; address: string };

/** Kroger's location IDs are eight characters, division and store number. */
export function isLocationId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9]{8}$/.test(value);
}

export function isZip(value: unknown): value is string {
  return typeof value === "string" && /^\d{5}$/.test(value);
}

export function readStores(body: unknown): Store[] {
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const stores: Store[] = [];
  for (const raw of data) {
    const row = raw as Record<string, unknown>;
    if (!isLocationId(row.locationId)) continue;
    const a = (row.address ?? {}) as Record<string, unknown>;
    const address = [a.addressLine1, a.city, a.state, a.zipCode].filter((x) => typeof x === "string" && x).join(", ");
    stores.push({ locationId: row.locationId, name: typeof row.name === "string" ? row.name : row.locationId, address });
  }
  return stores;
}

/** King Soopers stores near a ZIP. The chain filter keeps a Denver ZIP from offering a Kroger in another state's banner. */
export async function searchStores(accessToken: string, zip: string): Promise<Store[]> {
  const url = new URL(`${KROGER_API}/locations`);
  url.searchParams.set("filter.zipCode.near", zip);
  url.searchParams.set("filter.chain", "KINGSOOPERS");
  url.searchParams.set("filter.limit", "8");
  const response = await call(url.toString(), { headers: bearer(accessToken) });
  if (!response.ok) throw new KrogerError(`Kroger couldn't list stores (${await errorCode(response)}).`, response.status);
  return readStores(await response.json().catch(() => ({})));
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export type Product = {
  productId: string;
  /** What the Cart API takes. Kroger's product ID and UPC are the same 13 digits in practice; `upc` wins when both arrive. */
  upc: string;
  description: string;
  brand: string | null;
  size: string | null;
  /** The shelf price at the chosen store, promo first. Null when Kroger gave none. */
  price: number | null;
  /** Kroger's regular price at the store, or null. */
  regular: number | null;
  /** Kroger's sale price at the store, or null when there is none (Kroger sends 0 for none). */
  promo: number | null;
  /** When the sale price ends, as Kroger gave it, or null (TEC-121). */
  promoEnds: string | null;
  /** Fulfilment at the store: pickup (Kroger's `curbside`) and delivery. Null when Kroger did not say. */
  pickup: boolean | null;
  delivery: boolean | null;
  /** Kroger's stock level at the store, read as yes or no. Null when Kroger gave none. */
  inStock: boolean | null;
  /** The product's King Soopers page: Kroger's own when it gives one, else built from the description and ID. */
  url: string;
};

const SITE = "https://www.kingsoopers.com";

/**
 * A product page address. **Kroger's `productPageURI` wins when present**, with
 * its query string dropped; otherwise `/p/<slug>/<productId>`, the shape King
 * Soopers' own pages use. Either way `productIdFromUrl` reads the ID back off it.
 */
export function productPage(productId: string, description: string, given: unknown): string {
  if (typeof given === "string" && /^\/p\/[^/?#]+\/\d{8,14}(?:[?#].*)?$/.test(given)) {
    return SITE + given.replace(/[?#].*$/, "");
  }
  const slug =
    description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "product";
  return `${SITE}/p/${slug}/${productId}`;
}

/** Kroger's stock level, as yes, no, or not said. */
function readStock(item: Record<string, unknown> | null): boolean | null {
  const level = (item?.inventory as Record<string, unknown> | undefined)?.stockLevel;
  if (typeof level !== "string" || !level) return null;
  return level !== "TEMPORARILY_OUT_OF_STOCK";
}

/**
 * A date Kroger gave on a price, or null. The 2026-10-20 probe saw start and
 * end dates on the promo; a date is read as a string or as `{ value }`,
 * because a wrong guess here should cost the date, not the deal.
 */
function readDate(raw: unknown): string | null {
  const value = typeof raw === "string" ? raw : (raw as { value?: unknown } | null)?.value;
  return typeof value === "string" && value && !Number.isNaN(Date.parse(value)) ? value : null;
}

/**
 * One fulfilment flag, as yes, no or not said. **Keys are matched without
 * case**, and pickup is read from `curbside` or `pickup`: Kroger's published
 * examples say `curbside`, the probe's summary says "pickup", and either lands
 * here.
 */
function readFulfilment(item: Record<string, unknown> | null, keys: string[]): boolean | null {
  const flags = (item?.fulfillment ?? item?.fulfilment) as Record<string, unknown> | undefined;
  if (!flags || typeof flags !== "object") return null;
  for (const [k, v] of Object.entries(flags)) {
    if (keys.includes(k.toLowerCase()) && typeof v === "boolean") return v;
  }
  return null;
}

export function isUpc(value: unknown): value is string {
  return typeof value === "string" && /^\d{8,14}$/.test(value);
}

export function readProducts(body: unknown): Product[] {
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const products: Product[] = [];
  for (const raw of data) {
    const row = raw as Record<string, unknown>;
    const upc = isUpc(row.upc) ? row.upc : isUpc(row.productId) ? row.productId : null;
    if (!upc) continue;
    const item = (Array.isArray(row.items) ? row.items[0] : null) as Record<string, unknown> | null;
    const price = (item?.price ?? null) as Record<string, unknown> | null;
    const promo = typeof price?.promo === "number" && price.promo > 0 ? price.promo : null;
    const regular = typeof price?.regular === "number" && price.regular > 0 ? price.regular : null;
    const productId = isUpc(row.productId) ? row.productId : upc;
    const description = typeof row.description === "string" ? row.description : upc;
    products.push({
      productId,
      upc,
      description,
      brand: typeof row.brand === "string" && row.brand ? row.brand : null,
      size: typeof item?.size === "string" && item.size ? item.size : null,
      price: promo ?? regular,
      regular,
      promo,
      promoEnds: promo !== null ? readDate(price?.expirationDate) : null,
      pickup: readFulfilment(item, ["curbside", "pickup"]),
      delivery: readFulfilment(item, ["delivery"]),
      inStock: readStock(item),
      url: productPage(productId, description, row.productPageURI),
    });
  }
  return products;
}

/**
 * One product at the store, by its ID, or null when **Kroger no longer returns
 * it** — what a refresh flags. A 404 means the same as an empty answer; any
 * other refusal throws, because "Kroger said no" and "gone" are different facts.
 */
export async function productById(accessToken: string, productId: string, locationId: string): Promise<Product | null> {
  const url = new URL(`${KROGER_API}/products`);
  url.searchParams.set("filter.productId", productId);
  url.searchParams.set("filter.locationId", locationId);
  const response = await call(url.toString(), { headers: bearer(accessToken) });
  if (response.status === 404) return null;
  if (!response.ok) throw new KrogerError(`Kroger's product lookup failed (${await errorCode(response)}).`, response.status);
  const products = readProducts(await response.json().catch(() => ({})));
  return products.find((p) => p.productId === productId || p.upc === productId) ?? null;
}

/** Kroger's page size, and so the most IDs one `filter.productId` request asks for (probed 2026-10-20). */
export const PRODUCTS_PER_REQUEST = 50;

/**
 * Many products at the store by ID, **one request per fifty**: the probe
 * confirmed `filter.productId` takes several comma-separated IDs. A product
 * Kroger does not return is absent from the answer, and the caller says so.
 * Price, stock and fulfilment are empty without `filter.locationId`, so it is
 * always sent.
 */
export async function productsByIds(accessToken: string, productIds: string[], locationId: string): Promise<Product[]> {
  const ids = [...new Set(productIds.filter(isUpc))];
  const out: Product[] = [];
  for (let i = 0; i < ids.length; i += PRODUCTS_PER_REQUEST) {
    const url = new URL(`${KROGER_API}/products`);
    url.searchParams.set("filter.productId", ids.slice(i, i + PRODUCTS_PER_REQUEST).join(","));
    url.searchParams.set("filter.locationId", locationId);
    url.searchParams.set("filter.limit", String(PRODUCTS_PER_REQUEST));
    const response = await call(url.toString(), { headers: bearer(accessToken) });
    if (response.status === 404) continue;
    if (!response.ok) throw new KrogerError(`Kroger's product lookup failed (${await errorCode(response)}).`, response.status);
    out.push(...readProducts(await response.json().catch(() => ({}))));
  }
  return out;
}

/**
 * Kroger's search takes three characters at least and eight words at most.
 * Null when a line cannot be searched at all, so the caller can say so rather
 * than sending a request Kroger will refuse.
 */
export function searchTerm(words: string): string | null {
  const term = words.trim().replace(/\s+/g, " ").split(" ").slice(0, 8).join(" ");
  return term.length >= 3 ? term : null;
}

/** Kroger's top match at the store, or null when it has nothing. */
export async function topProduct(accessToken: string, term: string, locationId: string): Promise<Product | null> {
  const url = new URL(`${KROGER_API}/products`);
  url.searchParams.set("filter.term", term);
  url.searchParams.set("filter.locationId", locationId);
  url.searchParams.set("filter.limit", "1");
  const response = await call(url.toString(), { headers: bearer(accessToken) });
  if (!response.ok) throw new KrogerError(`Kroger's search failed (${await errorCode(response)}).`, response.status);
  return readProducts(await response.json().catch(() => ({})))[0] ?? null;
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

/**
 * Add one product to the cart. **One request per line on purpose**: the Cart
 * API takes a batch, but a refused batch says nothing about which line it
 * refused, and every line here has to report added, skipped or failed.
 *
 * `modality` (PICKUP or DELIVERY, TEC-121) goes on the item when given. **It
 * is unconfirmed**: an app token cannot reach this route, so the first
 * production Send is its first check, and `sendLines` retries a refused line
 * once without it and says so.
 */
export async function addToCart(accessToken: string, upc: string, quantity: number, modality: Modality | null = null): Promise<void> {
  const response = await call(`${KROGER_API}/cart/add`, {
    method: "PUT",
    headers: { ...bearer(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ items: [modality ? { upc, quantity, modality } : { upc, quantity }] }),
  });
  if (!response.ok) {
    throw new KrogerError(`Kroger refused it (${await errorCode(response)}).`, response.status, response.status === 401);
  }
}
