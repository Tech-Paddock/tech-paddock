import { NextResponse } from "next/server";
import { COOKIES } from "@/lib/auth";

// Clearing the cookie here clears it for every Paddock subdomain — it's the
// same domain-wide (.techpaddock.io) cookie every app's login sets.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIES.SESSION, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    domain: ".techpaddock.io",
    maxAge: 0,
    path: "/",
  });
  return res;
}
