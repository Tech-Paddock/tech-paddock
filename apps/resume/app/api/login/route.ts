import { NextRequest, NextResponse } from "next/server";
import {
  COOKIES,
  LOCKOUT_MAX_AGE_SECONDS,
  SESSION_MAX_AGE_SECONDS,
  clearAttemptsCookieValue,
  createSessionCookieValue,
  isLockedOut,
  readAttempts,
  recordFailure,
} from "@/lib/auth";
import { verifyPassword } from "@/lib/password";

export async function POST(request: NextRequest) {
  const attempts = await readAttempts(request.cookies.get(COOKIES.ATTEMPTS)?.value);

  if (isLockedOut(attempts)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  const { password } = await request.json().catch(() => ({ password: "" }));

  const valid = typeof password === "string" && password.length > 0 && (await verifyPassword(password));

  if (!valid) {
    const { cookieValue } = await recordFailure(attempts);
    const res = NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    res.cookies.set(COOKIES.ATTEMPTS, cookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      domain: ".techpaddock.io",
      maxAge: LOCKOUT_MAX_AGE_SECONDS,
      path: "/",
    });
    return res;
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIES.SESSION, await createSessionCookieValue(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    domain: ".techpaddock.io",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  res.cookies.set(COOKIES.ATTEMPTS, await clearAttemptsCookieValue(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    domain: ".techpaddock.io",
    maxAge: 0,
    path: "/",
  });
  return res;
}
