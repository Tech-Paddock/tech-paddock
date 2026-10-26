import { NextRequest, NextResponse } from "next/server";
import {
  COOKIES,
  SESSION_MAX_AGE_SECONDS,
  createSessionCookieValue,
  readSession,
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

// The one path a scheduler may call without a session (TEC-132): Cookbook's
// nightly price scan, by Vercel Cron. Exact path, never a prefix, so a sibling
// like /api/cron/prices2 is as shut as any other route. It passes only with
// `Authorization: Bearer <CRON_SECRET>`; a session cookie does not open it, and
// every other request to it is a 401. Unset or short CRON_SECRET (under 32
// characters) refuses everything, so a missing variable is never an open door.
// Every app carries this same gate (drift); only Cookbook has the route and the
// secret, so elsewhere the path is refused here and would 404 beyond it. The
// route checks the secret again itself.
const CRON_PATH = "/api/cron/prices";
const CRON_SECRET_MIN_LENGTH = 32;

// Constant time: both sides are hashed to the same length first, so neither the
// secret's length nor where a guess first differs shows in the timing.
async function cronAuthorized(authorization: string | null): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < CRON_SECRET_MIN_LENGTH) return false;
  const match = /^Bearer (.+)$/.exec(authorization ?? "");
  if (!match) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(match[1])),
    crypto.subtle.digest("SHA-256", enc.encode(secret)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === CRON_PATH) {
    if (await cronAuthorized(request.headers.get("authorization"))) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
