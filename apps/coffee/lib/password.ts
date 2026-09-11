import bcrypt from "bcryptjs";

// Node-only (bcryptjs isn't Edge-compatible) — import this from API routes,
// never from middleware.ts or anything middleware pulls in.
export async function verifyPassword(candidate: string) {
  const hash = process.env.APP_PASSWORD_HASH;
  if (!hash) throw new Error("APP_PASSWORD_HASH must be set");
  return bcrypt.compare(candidate, hash);
}
