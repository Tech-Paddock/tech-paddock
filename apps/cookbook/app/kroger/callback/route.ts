import { NextRequest, NextResponse } from "next/server";
import { completeCallback } from "@/lib/krogerConnection";
import { STATE_COOKIE, listUrl, stateCookieOptions } from "@/lib/krogerState";

export const dynamic = "force-dynamic";

/**
 * Kroger's redirect back: `https://cookbook.techpaddock.io/kroger/callback`,
 * exactly as registered (TEC-90).
 *
 * **A page route, not under `/api/`**, so an expired session bounces through
 * the login and back here rather than answering 401. The session cookie is
 * `SameSite=Lax`, so Kroger's top-level redirect carries it, and the password
 * gate sits in front of this as-is — **no exception in `proxy.ts`**.
 *
 * It checks the state, swaps the code for tokens, seals the refresh token and
 * sends the browser to the list with one word. **Nothing here is rendered and
 * no token reaches the response**: the redirect's query carries only the
 * outcome, and the state cookie is cleared whatever happened.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const outcome = await completeCallback({
    code: params.get("code"),
    state: params.get("state"),
    cookieState: request.cookies.get(STATE_COOKIE)?.value ?? null,
    error: params.get("error"),
  });

  const response = NextResponse.redirect(listUrl(request.url, outcome));
  response.cookies.set(STATE_COOKIE, "", stateCookieOptions(request.headers.get("host"), 0));
  return response;
}
