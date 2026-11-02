/* Stamped from packages/shared/lib/password.ts — do not edit this copy.
 * Edit the canonical file, then run: node scripts/stamp-shared.mjs
 * drift fails a copy that disagrees, and CI runs drift. */
import bcrypt from "bcryptjs";

// Import this from API routes, never from the gate file (proxy.ts) or anything
// it pulls in: proxy.ts runs on Node, so it would build, and put a bcrypt
// compare on every request.
export async function verifyPassword(candidate: string) {
  const hash = process.env.APP_PASSWORD_HASH;
  if (!hash) throw new Error("APP_PASSWORD_HASH must be set");
  return bcrypt.compare(candidate, hash);
}
