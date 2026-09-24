import { NextRequest, NextResponse } from "next/server";
import {
  COOKIES,
  SESSION_MAX_AGE_SECONDS,
  createSessionCookieValue,
  readSession,
  safeEqual,
  sessionCookieOptions,
  shouldRenewSession,
} from "@/lib/auth";

// What a signed-out browser may fetch: the login page, the login endpoint,
// and the icons the login page itself shows. Exact paths, never prefixes. A
// prefix admits every future route that happens to share it (`/login-history`,
// `/api/logins`, `/favicon-maker`) without anyone deciding it should.
const PUBLIC_ICONS = new Set([
  "/favicon.ico",
  "/icon.svg",
  "/icon.png",
  "/apple-icon.png",
  "/apple-touch-icon.png",
]);

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    pathname === "/login" ||
    pathname === "/api/login" ||
    // Next reserves /_next/ for its own assets and data; no app route can live
    // there, so this prefix cannot admit one.
    pathname.startsWith("/_next/") ||
    PUBLIC_ICONS.has(pathname)
  ) {
    return NextResponse.next();
  }

  // Server-to-server calls from other Paddock tools (currently: Pipeline
  // Tracker's draft-follow-up button) carry a shared secret instead of a
  // browser session cookie. Scoped to /api/draft only — never a blanket
  // bypass for the rest of the API. Compared in constant time; a wrong or
  // missing secret falls through to the session check below.
  if (pathname === "/api/draft") {
    const internalSecret = process.env.INTERNAL_API_SECRET;
    const provided = request.headers.get("x-internal-secret");
    if (internalSecret && provided !== null && safeEqual(provided, internalSecret)) {
      return NextResponse.next();
    }
  }

  const session = await readSession(request.cookies.get(COOKIES.SESSION)?.value);
  if (session) {
    const res = NextResponse.next();
    if (shouldRenewSession(session)) {
      res.cookies.set(
        COOKIES.SESSION,
        await createSessionCookieValue(),
        sessionCookieOptions(request.headers.get("host"), SESSION_MAX_AGE_SECONDS)
      );
    }
    return res;
  }

  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The query string travels too, so /?app=coffee comes back to Coffee rather
  // than to the hub's front page. The login page only follows it if it is a
  // path on this origin (lib/safe-redirect.ts).
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
