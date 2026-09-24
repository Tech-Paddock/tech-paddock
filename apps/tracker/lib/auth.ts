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
  // across subdomains. Set the same SESSION_SECRET everywhere.
  //
  // **Use at least 32 random bytes** — `openssl rand -base64 32` — never a
  // word or a phrase. Every session cookie is a known payload next to its
  // HMAC, so a short or guessable secret can be recovered offline at GPU
  // speed, and whoever has it can mint a session for all seven apps.
  //
  // Length is deliberately not enforced here: the live value cannot be read
  // back out of Vercel, and a throw would take every app down at once. Rotate
  // to a strong value first; a check can follow once that is known to be true.
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET must be set");
  return s;
}

// Web Crypto (not node:crypto) so this also works in the Edge runtime, where
// middleware.ts runs.
//
// The imported key is cached per instance, keyed by the secret string itself,
// so a request pays for importKey once rather than on every sign and verify.
// Keyed rather than memoised blindly so a changed SESSION_SECRET (tests, or an
// environment swapped under a warm instance) is never verified against the
// old key.
let cachedKey: { secret: string; key: Promise<CryptoKey> } | null = null;

function hmacKey(): Promise<CryptoKey> {
  const s = secret();
  if (cachedKey === null || cachedKey.secret !== s) {
    const key = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(s),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
    // Never keep a rejected import: it would fail every request until the
    // instance recycled. importKey on a non-empty raw key does not reject in
    // practice; this makes sure it cannot become sticky if it ever does.
    key.catch(() => {
      if (cachedKey?.key === key) cachedKey = null;
    });
    cachedKey = { secret: s, key };
  }
  return cachedKey.key;
}

async function sign(payload: string) {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(payload));
  return Buffer.from(sig).toString("hex");
}

// Exactly what sign() produces: 32 bytes as lowercase hex. Anything else was
// never a signature this code issued, and is refused before any crypto runs.
const SIGNATURE_HEX = /^[0-9a-f]{64}$/;

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

// crypto.subtle.verify compares in constant time. The `!==` this replaced
// returned at the first differing character.
async function verify(payload: string, signature: string) {
  if (!SIGNATURE_HEX.test(signature)) return false;
  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(),
    hexToBytes(signature),
    new TextEncoder().encode(payload)
  );
}

function encode(payload: object) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decode(body: string): unknown {
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

async function pack(payload: object) {
  const body = encode(payload);
  return `${body}.${await sign(body)}`;
}

async function unpack<T>(value: string | undefined): Promise<T | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !(await verify(body, sig))) return null;
  return decode(body) as T | null;
}

/**
 * Constant-time string equality, for comparing a presented secret against the
 * configured one. Pure JavaScript because middleware runs on the Edge runtime,
 * where node:crypto's timingSafeEqual does not exist.
 *
 * Every byte of the longer input is visited whatever the contents, so the time
 * taken says nothing about where the first difference is. It does reveal the
 * lengths, which is the accepted cost of every such comparison and says nothing
 * useful about a random secret.
 */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * The failed-attempts counter is **advisory, and deliberately unsigned.**
 *
 * It lives in a cookie the client controls: a script that does not send it
 * back starts from zero on every guess, so no signature could make it a real
 * control, and nothing here pretends it is one. What it does is slow down a
 * person at a browser. The password itself is the control.
 *
 * It used to be HMAC-signed with SESSION_SECRET, which protected nothing and
 * handed every anonymous caller a known payload with its signature, a free
 * sample for guessing the secret offline. It is now plain base64url JSON.
 */
type Attempts = { count: number; lockUntil: number | null };

const NO_ATTEMPTS: Attempts = { count: 0, lockUntil: null };

/**
 * Anything malformed reads as no attempts at all. That is not a weakness: a
 * client can already reach the same state by not sending the cookie.
 *
 * A lock is never honoured for longer than one lockout window from now, so a
 * value planted in the browser (from another techpaddock.io subdomain, say)
 * cannot shut the owner out for longer than failing five times would.
 */
export function readAttempts(cookieValue: string | undefined, now = Date.now()): Attempts {
  if (!cookieValue) return { ...NO_ATTEMPTS };
  // A cookie issued before this change is `body.signature`. The body is the
  // same JSON, so a lockout in progress survives the deploy.
  const raw = decode(cookieValue.split(".")[0]);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...NO_ATTEMPTS };

  const { count, lockUntil } = raw as { count?: unknown; lockUntil?: unknown };
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) return { ...NO_ATTEMPTS };
  if (lockUntil === null || lockUntil === undefined) return { count, lockUntil: null };
  if (typeof lockUntil !== "number" || !Number.isFinite(lockUntil)) return { ...NO_ATTEMPTS };
  return { count, lockUntil: Math.min(lockUntil, now + LOCKOUT_MS) };
}

export function isLockedOut(attempts: Attempts, now = Date.now()) {
  return !!attempts.lockUntil && attempts.lockUntil > now;
}

export function recordFailure(attempts: Attempts, now = Date.now()): {
  attempts: Attempts;
  cookieValue: string;
} {
  const count = attempts.count + 1;
  const lockUntil = count >= MAX_ATTEMPTS ? now + LOCKOUT_MS : attempts.lockUntil;
  const next: Attempts = { count, lockUntil };
  return { attempts: next, cookieValue: encode(next) };
}

export function clearAttemptsCookieValue() {
  return encode(NO_ATTEMPTS);
}

// The session cookie is signed exactly as it always has been: base64url JSON,
// a dot, and HMAC-SHA256 of that base64url string as lowercase hex. Only the
// comparison changed, so every session issued before this still verifies.
export async function createSessionCookieValue() {
  return pack({ exp: Date.now() + SESSION_MS });
}

export async function readSession(cookieValue: string | undefined) {
  const session = await unpack<{ exp?: unknown }>(cookieValue);
  return session && typeof session.exp === "number" && session.exp > Date.now()
    ? (session as { exp: number })
    : null;
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
