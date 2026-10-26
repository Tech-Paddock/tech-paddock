import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The cron route's own check of `Authorization: Bearer <CRON_SECRET>` (TEC-132).
 *
 * **The gate checks it first** (`proxy.ts`, the one exact path
 * `/api/cron/prices`), and the route checks it again, so the secret is never
 * the gate's job alone: a gate edit that opened the path by mistake would
 * still meet this. Same rules in both places: the secret must be set and at
 * least 32 characters, or **everything is refused**; the comparison takes the
 * same time wherever a guess first differs (both sides hashed to one length,
 * then `timingSafeEqual`).
 */

export const CRON_SECRET_MIN_LENGTH = 32;

const digest = (s: string) => createHash("sha256").update(s).digest();

export function cronAuthorized(authorization: string | null, secret: string | undefined = process.env.CRON_SECRET): boolean {
  if (!secret || secret.length < CRON_SECRET_MIN_LENGTH) return false;
  const match = /^Bearer (.+)$/.exec(authorization ?? "");
  if (!match) return false;
  return timingSafeEqual(digest(match[1]), digest(secret));
}
