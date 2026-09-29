import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { COOKIES } from "@/lib/auth";
import { handleLogout } from "@/lib/logout";
import { POST } from "@/app/api/logout/route";

/**
 * The shared logout handler (TEC-73). lib/logout.ts is stamped from
 * packages/shared, so this covers every app's copy; it lives here because the
 * hub is live, has vitest, and had the only logout route before.
 *
 * What it pins: the session cookie is cleared — empty, max-age 0 — on the
 * shared .techpaddock.io domain with the attributes that set it, so one logout
 * reaches every subdomain. A cookie with a different domain or path would be a
 * second cookie, and the real session would survive beside it.
 */

function logoutRequest(host: string) {
  return new NextRequest(`https://${host}/api/logout`, {
    method: "POST",
    headers: { host, cookie: `${COOKIES.SESSION}=some.session` },
  });
}

function sessionSetCookie(res: Response) {
  const header = res.headers.getSetCookie().find((c) => c.startsWith(`${COOKIES.SESSION}=`));
  expect(header, "the response must set the session cookie").toBeDefined();
  return header!;
}

describe("handleLogout", () => {
  for (const host of ["techpaddock.io", "coffee.techpaddock.io", "cookbook.techpaddock.io"]) {
    it(`clears the session on the shared domain from ${host}`, async () => {
      const res = await handleLogout(logoutRequest(host));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });

      const cookie = sessionSetCookie(res);
      expect(cookie).toMatch(new RegExp(`^${COOKIES.SESSION}=;`));
      expect(cookie).toMatch(/Max-Age=0(;|$)/i);
      expect(cookie).toMatch(/Domain=\.?techpaddock\.io(;|$)/i);
      expect(cookie).toMatch(/Path=\/(;|$)/i);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Secure/i);
      expect(cookie).toMatch(/SameSite=lax/i);

      const parsed = res.cookies.get(COOKIES.SESSION);
      expect(parsed?.value).toBe("");
      expect(parsed?.maxAge).toBe(0);
      expect(parsed?.domain).toBe(".techpaddock.io");
    });
  }

  it("clears a host-only cookie off the shared domain, as login set it there", async () => {
    const res = await handleLogout(logoutRequest("localhost:3000"));
    const cookie = sessionSetCookie(res);
    expect(cookie).toMatch(/Max-Age=0(;|$)/i);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it("is what the route exports as POST", () => {
    expect(POST).toBe(handleLogout);
  });
});
