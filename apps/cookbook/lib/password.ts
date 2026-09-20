/* Stamped from packages/shared/lib/password.ts — do not edit this copy.
 * Edit the canonical file, then run: node scripts/stamp-shared.mjs
 * drift fails a copy that disagrees, and CI runs drift. */
import bcrypt from "bcryptjs";

// Node-only (bcryptjs isn't Edge-compatible) — import this from API routes,
// never from middleware.ts or anything middleware pulls in.
export async function verifyPassword(candidate: string) {
  const hash = process.env.APP_PASSWORD_HASH;
  if (!hash) throw new Error("APP_PASSWORD_HASH must be set");
  return bcrypt.compare(candidate, hash);
}
