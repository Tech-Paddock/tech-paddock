import bcrypt from "bcryptjs";

// Node-only (bcryptjs isn't Edge-compatible) — import this from API routes,
// never from the gate file (middleware.ts on Next 14, proxy.ts on Next 16) or
// anything it pulls in. proxy.ts runs on Node, so there it would build — and
// put a bcrypt compare on every request; keep it out on either runtime.
export async function verifyPassword(candidate: string) {
  const hash = process.env.APP_PASSWORD_HASH;
  if (!hash) throw new Error("APP_PASSWORD_HASH must be set");
  return bcrypt.compare(candidate, hash);
}
