import { NextRequest, NextResponse } from "next/server";
import { COOKIES, sessionCookieOptions } from "./auth";

/**
 * POST /api/logout for every app. Each `app/api/logout/route.ts` re-exports it,
 * the same shape as the login handler in ./login.ts.
 *
 * It clears the session cookie with the options that set it, at max-age 0.
 * On a techpaddock.io host those options carry `domain: .techpaddock.io`, so
 * clearing it here clears it for every subdomain at once: logging out of any
 * app logs you out of all of them. A cookie is only replaced by one with the
 * same name, domain and path, which is why this reuses sessionCookieOptions
 * rather than spelling the attributes out a second time.
 *
 * Only the hub had this route until TEC-73 (2026-09-26); it is stamped from
 * packages/shared now so every app's header can offer it.
 *
 * It needs no middleware exception. A signed-in request reaches it like any
 * other route; a signed-out one is answered 401 by the middleware, which the
 * control reads as already logged out.
 */
export async function handleLogout(request: NextRequest): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIES.SESSION, "", sessionCookieOptions(request.headers.get("host"), 0));
  return res;
}
