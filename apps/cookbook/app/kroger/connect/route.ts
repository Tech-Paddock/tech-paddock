import { NextRequest, NextResponse } from "next/server";
import { authorizeUrl, krogerConfig } from "@/lib/kroger";
import { makeState } from "@/lib/krogerCrypto";
import { STATE_COOKIE, listUrl, stateCookieOptions } from "@/lib/krogerState";

export const dynamic = "force-dynamic";

/**
 * **Connect King Soopers** — the list tab's link lands here, and this sends the
 * browser to Kroger's sign-in with a fresh state (TEC-90).
 *
 * Not under `/api/`, so `proxy.ts` treats it as a page: signed out, it bounces
 * through the login. It is behind the gate like every route; **no exception was
 * added to the gate file**.
 */
export async function GET(request: NextRequest) {
  let config;
  try {
    config = krogerConfig();
  } catch {
    return NextResponse.redirect(listUrl(request.url, "unconfigured"));
  }

  const state = makeState(config.key);
  const response = NextResponse.redirect(authorizeUrl(config, state));
  response.cookies.set(STATE_COOKIE, state, stateCookieOptions(request.headers.get("host"), 600));
  return response;
}
