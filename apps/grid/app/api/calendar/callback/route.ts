import { NextResponse } from "next/server";
import { STATE_COOKIE, credentials, exchangeCode, realFetch } from "@/lib/calendar/graph";
import { supabaseStore } from "@/lib/calendar/store";

export const dynamic = "force-dynamic";

/**
 * Microsoft sends the browser back here with a one-time code. The code is
 * exchanged for tokens and only the refresh token is kept (in `calendar.connection`).
 * Every outcome redirects to /more with `?calendar=connected` or `?calendar=failed`:
 * nothing Microsoft says is repeated, and nothing is logged.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (outcome: "connected" | "failed") => {
    const res = NextResponse.redirect(new URL(`/more?calendar=${outcome}`, url.origin));
    res.cookies.set(STATE_COOKIE, "", { path: "/api/calendar", maxAge: 0 });
    return res;
  };

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const kept = request.headers
    .get("cookie")
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);
  const c = credentials();
  if (!c || !code || !state || !kept || state !== kept) return back("failed");

  try {
    const t = await exchangeCode(realFetch, c, code, `${url.origin}/api/calendar/callback`);
    await supabaseStore().saveRefreshToken(t.refreshToken);
    return back("connected");
  } catch {
    return back("failed");
  }
}
