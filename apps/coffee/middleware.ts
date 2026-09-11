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
