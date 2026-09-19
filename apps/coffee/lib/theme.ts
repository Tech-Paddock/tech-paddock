/**
 * Paddock theme — the shared half.
 *
 * Byte-identical in all five apps, the arrangement lib/auth.ts and
 * lib/password.ts already use. It holds no secret and touches no session.
 *
 * Two axes, and they are deliberately different kinds of thing.
 *
 * **Livery is per app and fixed at build time.** Coffee is John Player
 * Special, the hub is Martini, and neither can become the other. That is why
 * there is no livery cookie and no picker: the app names its own livery in its
 * layout, the layout stays statically renderable, and the tokens arrive from
 * lib/theme.css. The hub embedding a tool whose livery differs is the design
 * rather than a defect — you are looking at two cars.
 *
 * **Polarity is per person and shared across every subdomain.** One cookie on
 * .techpaddock.io, so switching to light in Coffee switches the hub too.
 */

export type Mode = "light" | "dark";

export type Livery = "martini" | "clark" | "senna" | "mp44" | "jps";

/**
 * Two lines, shown beside the page title: **who and when**, then **what and who
 * drove it**. Joel set that shape on 2026-09-19.
 *
 * **Line one names the livery, not always the constructor.** Martini and JPS
 * were the identity of those cars more than Brabham and Lotus were, and the
 * badge's job is to say which livery you are looking at — so the sponsor name
 * wins where the sponsor is the thing you recognise. Clark goes the other way
 * and reads "Lotus '63", because naming it "Clark '63" above a line that ends
 * "Jim Clark" says his name twice and the season once.
 *
 * The inspiration line is deliberately not the palette's own `source` field.
 * That one is written to be read in a spec and runs long — Martini's names three
 * cars across two decades — where this has to sit in a bar beside an app title.
 */
export const LIVERIES: Record<Livery, { name: string; source: string }> = {
  martini: {
    name: "Martini '75",
    source: "Brabham BT44B, Reutemann",
  },
  clark: {
    name: "Lotus '63",
    source: "Type 25, Jim Clark",
  },
  senna: {
    // The one that does not fit, and deliberately not forced to. Every other
    // livery is a car in a season; this one is a crash helmet across a career,
    // so inventing a team and a chassis for it would be inventing a fact.
    name: "Senna",
    source: "Helmet, 1984–1994",
  },
  mp44: {
    name: "McLaren '88",
    source: "MP4/4, Ayrton Senna",
  },
  jps: {
    name: "JPS '78",
    source: "Lotus 79, Mario Andretti",
  },
};

export const THEME_COOKIE = "paddock_mode";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * Absent is not the same as light. No cookie means "follow the system", which
 * lib/theme.css answers with a prefers-color-scheme media query — no blocking
 * script, and nothing to flash.
 */
export function readMode(cookieValue: string | undefined): Mode | null {
  return cookieValue === "light" || cookieValue === "dark" ? cookieValue : null;
}

/**
 * Built for document.cookie, not for a Set-Cookie header, and deliberately not
 * httpOnly — it carries a preference, never a credential. Writing it from the
 * browser is what makes the switch instant: the attribute flips on <html> in
 * the same tick and nothing round-trips to the server.
 *
 * The domain logic mirrors sessionCookieOptions in lib/auth.ts rather than
 * importing it, because that file is gated and this one must not reach into
 * it. A host may only set a cookie for a domain it belongs to, so off
 * techpaddock.io — localhost, *.vercel.app previews — this falls back to a
 * host-only cookie instead of setting nothing at all.
 */
export function themeCookieString(hostname: string, protocol: string, mode: Mode) {
  const shared = hostname === "techpaddock.io" || hostname.endsWith(".techpaddock.io");
  const parts = [
    `${THEME_COOKIE}=${mode}`,
    "path=/",
    `max-age=${ONE_YEAR_SECONDS}`,
    "samesite=lax",
  ];
  if (shared) parts.push("domain=.techpaddock.io");
  if (protocol === "https:") parts.push("secure");
  return parts.join("; ");
}

/**
 * Whether a postMessage origin is one of ours.
 *
 * The hub embeds each tool in a cross-origin iframe, so writing the cookie and
 * stamping <html> in the hub's document does not reach a frame that has already
 * loaded. The hub posts `{ type: "paddock-mode", mode }` to each frame instead
 * and the tool restamps itself; this is the guard on the receiving end.
 *
 * **It is defence in depth, not the control.** Posting into a frame requires
 * framing it first, and every tool already sends `frame-ancestors 'self'
 * https://techpaddock.io https://*.techpaddock.io` — so the hub is the only
 * page that can be the sender. What travels is a display preference: no
 * credential, no data read, and the worst a forged message could do is flip the
 * colours of a page whoever sent it had already embedded.
 *
 * `.vercel.app` is admitted deliberately rather than by oversight — preview
 * deployments are where this gets exercised before it reaches the domain, and
 * the paragraph above is why that costs nothing.
 *
 * The host logic mirrors themeCookieString above rather than sharing a helper
 * with it: that one answers "may I set a cookie for this domain", which is a
 * browser rule, and this one answers "do I trust this sender". They agree today
 * and are not the same question.
 */
export function isPaddockOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== "https:" && protocol !== "http:") return false;
    if (hostname === "techpaddock.io" || hostname.endsWith(".techpaddock.io")) return true;
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    return hostname.endsWith(".vercel.app");
  } catch {
    // An opaque origin arrives as the string "null" — a sandboxed frame or a
    // data: URL. Not ours, and never a parse this should throw on.
    return false;
  }
}
