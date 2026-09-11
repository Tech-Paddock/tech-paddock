import { NextRequest, NextResponse } from "next/server";
import { COOKIES, sessionCookieOptions } from "@/lib/auth";

// Clearing the cookie here clears it for every Paddock subdomain — it's the
// same domain-wide (.techpaddock.io) cookie every app's login sets.
export async function POST(request: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIES.SESSION, "", sessionCookieOptions(request.headers.get("host"), 0));
  return res;
}
