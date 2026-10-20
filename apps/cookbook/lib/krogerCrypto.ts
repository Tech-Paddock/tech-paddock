import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The Kroger refresh token at rest, and the OAuth `state` that guards its arrival.
 *
 * **Server-side only.** Nothing in the browser imports this file, and nothing
 * here logs. The refresh token is the one credential this app holds for someone
 * else's service (TEC-90): its scope is add-to-cart and product read, so a leak's
 * worst case is items in Joel's cart, and encrypting it means a leaked database
 * row is not even that.
 *
 * **AES-256-GCM under `KROGER_TOKEN_KEY`** (base64, 32 bytes — `openssl rand
 * -base64 32`). GCM authenticates as well as encrypts, so a wrong key or an
 * edited row fails loudly at `open` rather than handing Kroger garbage.
 *
 * The sealed form is `v1:` + base64(iv ‖ tag ‖ ciphertext). The prefix is the
 * version, and the `kroger_connection` table refuses a value without it, so a
 * plaintext token cannot be written there by mistake.
 */

const VERSION = "v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Why a key is unusable, in words the list tab can show. Null when it is fine. */
export function keyProblem(raw: string | undefined): string | null {
  if (!raw) return "KROGER_TOKEN_KEY is not set";
  const bytes = Buffer.from(raw.trim(), "base64");
  if (bytes.length !== 32) {
    return "KROGER_TOKEN_KEY is set but is not 32 bytes of base64 — generate one with openssl rand -base64 32";
  }
  return null;
}

/** The key as bytes. Throws when `keyProblem` would say why. */
export function readKey(raw: string | undefined): Buffer {
  const problem = keyProblem(raw);
  if (problem) throw new Error(problem);
  return Buffer.from((raw as string).trim(), "base64");
}

export function seal(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return VERSION + Buffer.concat([iv, tag, body]).toString("base64");
}

/**
 * The plaintext back, or a throw. **A wrong key throws; it never returns a
 * different string** — GCM's tag is what guarantees that, and the tests hold it.
 * The error says nothing about the value.
 */
export function open(sealed: string, key: Buffer): string {
  if (!sealed.startsWith(VERSION)) throw new Error("The stored Kroger token is not in a form this app wrote.");
  const all = Buffer.from(sealed.slice(VERSION.length), "base64");
  if (all.length < IV_BYTES + TAG_BYTES + 1) throw new Error("The stored Kroger token is damaged.");
  const iv = all.subarray(0, IV_BYTES);
  const tag = all.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const body = all.subarray(IV_BYTES + TAG_BYTES);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("The stored Kroger token could not be decrypted — KROGER_TOKEN_KEY has changed since it was saved.");
  }
}

// ---------------------------------------------------------------------------
// OAuth state. **Double-submit, and signed**: `/kroger/connect` sets the value
// in an httpOnly cookie on this host and sends the same value to Kroger; the
// callback accepts only a state that equals the cookie *and* carries this app's
// signature. The cookie is only ever issued to a browser past the password gate,
// so the state is tied to that signed-in browser; the signature means a cookie
// planted from a sibling subdomain cannot be one this app would accept.
// ---------------------------------------------------------------------------

/** A key for signing state, derived so the encryption key is never used twice over. */
function stateKey(key: Buffer): Buffer {
  return createHmac("sha256", key).update("cookbook kroger oauth state").digest();
}

function signNonce(nonce: string, key: Buffer): string {
  return createHmac("sha256", stateKey(key)).update(nonce).digest("base64url");
}

export function makeState(key: Buffer): string {
  const nonce = randomBytes(24).toString("base64url");
  return `${nonce}.${signNonce(nonce, key)}`;
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Does the state Kroger handed back match the cookie, and did this app sign it? */
export function stateIsValid(returned: string | null | undefined, cookie: string | null | undefined, key: Buffer): boolean {
  if (!returned || !cookie) return false;
  if (!sameString(returned, cookie)) return false;
  const [nonce, signature, extra] = returned.split(".");
  if (!nonce || !signature || extra !== undefined) return false;
  return sameString(signature, signNonce(nonce, key));
}
