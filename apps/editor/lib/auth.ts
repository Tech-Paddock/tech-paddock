/* Stamped from packages/shared/lib/auth.ts — do not edit this copy.
 * Edit the canonical file, then run: node scripts/stamp-shared.mjs
 * drift fails a copy that disagrees, and CI runs drift. */
const SESSION_COOKIE = "paddock_session";
const ATTEMPTS_COOKIE = "paddock_attempts";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
// Slide the expiry once a session is past its halfway point, so regular use
// keeps you signed in. Without this a session dies a fixed SESSION_MS after
// login however often you visit, and a device you use rarely starts asking for
// the password while a daily-driver browser never does.
const RENEW_AFTER_MS = SESSION_MS / 2;

function secret() {
  // Deliberately separate from APP_PASSWORD_HASH: that value differs per app
  // (bcrypt salts randomly), but this signing secret must be byte-identical
  // on every Paddock app for the shared .techpaddock.io cookie to validate
  // across subdomains. Set the same SESSION_SECRET everywhere — any random
  // string works, it's never compared to anything but itself.
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET must be set");
  return s;
}

// Web Crypto (not node:crypto) so this also works in the Edge runtime, where
// middleware.ts runs.
async function sign(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Buffer.from(sig).toString("hex");
}

async function pack(payload: object) {
  const json = JSON.stringify(payload);
  const body = Buffer.from(json).toString("base64url");
  return `${body}.${await sign(body)}`;
}

async function unpack<T>(value: string | undefined): Promise<T | null> {
  if (!value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  if ((await sign(body)) !== sig) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

type Attempts = { count: number; lockUntil: number | null };

export async function readAttempts(cookieValue: string | undefined): Promise<Attempts> {
  return (await unpack<Attempts>(cookieValue)) ?? { count: 0, lockUntil: null };
}

export function isLockedOut(attempts: Attempts) {
  return !!attempts.lockUntil && attempts.lockUntil > Date.now();
}

export async function recordFailure(attempts: Attempts): Promise<{
  attempts: Attempts;
  cookieValue: string;
}> {
  const count = attempts.count + 1;
  const lockUntil = count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : attempts.lockUntil;
  const next: Attempts = { count, lockUntil };
  return { attempts: next, cookieValue: await pack(next) };
}

export async function clearAttemptsCookieValue() {
  return pack({ count: 0, lockUntil: null } satisfies Attempts);
}

export async function createSessionCookieValue() {
  return pack({ exp: Date.now() + SESSION_MS });
}

export async function hasValidSession(cookieValue: string | undefined) {
  const session = await unpack<{ exp: number }>(cookieValue);
  return !!session && session.exp > Date.now();
}

export async function readSession(cookieValue: string | undefined) {
  const session = await unpack<{ exp: number }>(cookieValue);
  return session && session.exp > Date.now() ? session : null;
}

export function shouldRenewSession(session: { exp: number }) {
  return session.exp - Date.now() < RENEW_AFTER_MS;
}

function isLocalHost(host: string | null | undefined) {
  return !!host && /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
}

// One login covers every subdomain because the cookie is scoped to
// .techpaddock.io. A host can only set a cookie for a domain it belongs to, so
// hardcoding that domain meant localhost and *.vercel.app preview deployments
// set no cookie at all and looped back to the login screen forever. Off those
// hosts we fall back to a host-only cookie instead.
export function sessionCookieOptions(host: string | null | undefined, maxAge: number) {
  const shared = !!host && (host === "techpaddock.io" || host.endsWith(".techpaddock.io"));
  return {
    httpOnly: true,
    secure: !isLocalHost(host),
    sameSite: "lax" as const,
    ...(shared ? { domain: ".techpaddock.io" } : {}),
    maxAge,
    path: "/",
  };
}

export const COOKIES = {
  SESSION: SESSION_COOKIE,
  ATTEMPTS: ATTEMPTS_COOKIE,
};

export const SESSION_MAX_AGE_SECONDS = SESSION_MS / 1000;
export const LOCKOUT_MAX_AGE_SECONDS = LOCKOUT_MS / 1000;
