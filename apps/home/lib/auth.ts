const SESSION_COOKIE = "paddock_session";
const ATTEMPTS_COOKIE = "paddock_attempts";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function secret() {
  const s = process.env.APP_PASSWORD_HASH;
  if (!s) throw new Error("APP_PASSWORD_HASH must be set");
  return s;
}

// Web Crypto (not node:crypto) so this also works in the Edge runtime, where
// middleware.ts runs. Same secret across every Paddock app so the session
// cookie (scoped to .techpaddock.io) validates everywhere — log in once.
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

export const COOKIES = {
  SESSION: SESSION_COOKIE,
  ATTEMPTS: ATTEMPTS_COOKIE,
};

export const SESSION_MAX_AGE_SECONDS = SESSION_MS / 1000;
export const LOCKOUT_MAX_AGE_SECONDS = LOCKOUT_MS / 1000;
