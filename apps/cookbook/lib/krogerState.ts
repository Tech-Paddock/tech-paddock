/**
 * The OAuth state cookie (TEC-90). One name and one set of options, shared by
 * `/kroger/connect`, which sets it, and `/kroger/callback`, which reads and
 * clears it.
 *
 * **Host-only, httpOnly, Lax, `/kroger` only, ten minutes.** Lax is what lets
 * Kroger's top-level redirect back carry it; host-only and the path keep it off
 * every other subdomain and every other route; ten minutes is a sign-in, not a
 * session.
 */
export const STATE_COOKIE = "cookbook_kroger_state";

export function stateCookieOptions(host: string | null, maxAge: number) {
  const local = !!host && /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  return { httpOnly: true, secure: !local, sameSite: "lax" as const, path: "/kroger", maxAge };
}

/** Where the callback lands, and the one word the list tab turns into a sentence. */
export function listUrl(requestUrl: string, outcome: string): URL {
  const url = new URL("/list", requestUrl);
  url.searchParams.set("kroger", outcome);
  return url;
}
