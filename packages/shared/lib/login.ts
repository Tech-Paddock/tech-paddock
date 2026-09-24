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
  sessionCookieOptions,
} from "./auth";
import { verifyPassword } from "./password";

/**
 * POST /api/login for every app. Each `app/api/login/route.ts` re-exports it.
 *
 * It was seven hand-copied routes in three slightly different versions, which
 * made every fix to the login path seven edits. It is stamped from
 * packages/shared now, like the session code it calls.
 *
 * Node-only, because it imports lib/password.ts (bcryptjs). Never import it
 * from middleware.ts.
 *
 * The attempts counter is advisory — see lib/auth.ts. The password is the
 * control.
 */
export async function handleLogin(request: NextRequest): Promise<NextResponse> {
  const host = request.headers.get("host");
  const attempts = readAttempts(request.cookies.get(COOKIES.ATTEMPTS)?.value);

  if (isLockedOut(attempts)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  // A body of `null`, a number or an array used to throw while destructuring
  // and answer 500. Anything that is not an object carrying a string password
  // is simply a wrong password.
  const body: unknown = await request.json().catch(() => null);
  const password = body && typeof body === "object" ? (body as { password?: unknown }).password : undefined;

  const valid = typeof password === "string" && password.length > 0 && (await verifyPassword(password));

  if (!valid) {
    const { cookieValue } = recordFailure(attempts);
    const res = NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    res.cookies.set(COOKIES.ATTEMPTS, cookieValue, sessionCookieOptions(host, LOCKOUT_MAX_AGE_SECONDS));
    return res;
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIES.SESSION, await createSessionCookieValue(), sessionCookieOptions(host, SESSION_MAX_AGE_SECONDS));
  res.cookies.set(COOKIES.ATTEMPTS, clearAttemptsCookieValue(), sessionCookieOptions(host, 0));
  return res;
}
