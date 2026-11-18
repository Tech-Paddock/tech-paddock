import { NextResponse } from "next/server";
import { STATE_COOKIE, authorizeUrl, credentials } from "@/lib/calendar/graph";

export const dynamic = "force-dynamic";

/**
 * The one-time connect: sends the signed-in owner to Microsoft to approve the
 * household account. The `state` is a random value also kept in a short-lived
 * cookie, and the callback refuses a return whose two do not match.
 */
export function GET(request: Request) {
  const c = credentials();
  if (!c) return NextResponse.json({ error: "MS_CLIENT_ID and MS_CLIENT_SECRET are not set in this project." }, { status: 503 });
  const origin = new URL(request.url).origin;
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authorizeUrl(c, `${origin}/api/calendar/callback`, state));
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/calendar", maxAge: 600 });
  return res;
}
