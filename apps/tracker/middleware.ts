import { NextRequest, NextResponse } from "next/server";
import {
  COOKIES,
  SESSION_MAX_AGE_SECONDS,
  createSessionCookieValue,
  readSession,
  sessionCookieOptions,
  shouldRenewSession,
} from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Vercel Cron invokes the stale sweep with no browser session. The route
  // checks CRON_SECRET itself; the middleware only steps out of its way.
  if (pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  // The hub renders its landing glance server-side, so its request for the
  // roll-up carries a shared secret rather than a browser session cookie.
  // Scoped to /api/summary only — never a blanket bypass for the rest of the
  // API — mirroring the editor's bypass for /api/draft.
  if (pathname === "/api/summary") {
    const internalSecret = process.env.INTERNAL_API_SECRET;
    const provided = request.headers.get("x-internal-secret");
    if (internalSecret && provided === internalSecret) {
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

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
