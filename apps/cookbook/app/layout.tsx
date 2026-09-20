import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { LIVERY } from "@/lib/livery";
import { readMode, THEME_COOKIE } from "@/lib/theme";
import "@/lib/theme.css";
import "./globals.css";

export const metadata: Metadata = {
  // **Product first, tool second — "Paddock — X" in every app.** A browser tab
  // is read left to right and truncates from the right, so the half that is the
  // same everywhere has to come first or a row of tabs is unreadable.
  title: "Paddock — Cookbook",
  description: "What you could cook, what it costs you, and what to buy for it.",

  // **No `appleWebApp` and no apple-touch-icon, deliberately.** Health and
  // Coffee both carry them because they are apps; this one is a *site*, settled
  // at standup and argued in `.claude/SURFACE.md` — a cookbook is a collection,
  // so the index is the product. A site has no home-screen install, so
  // scaffolding the metadata for one would ship a decision nobody made, in the
  // direction the surface call went against.
};

// You are sitting down with a laptop or standing with a phone, but either way
// you arrive to browse rather than to do one known thing. No `viewportFit:
// "cover"`, because that exists for a page launched from the home screen and
// this one is not.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f1e8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading a cookie opts this layout into dynamic rendering. That costs
  // nothing here: every route in this app already goes through the password
  // gate in middleware.ts, so none of them was ever served from a static cache.
  // What it buys is the polarity being correct in the very first byte of HTML,
  // with no blocking script and nothing to flash.
  const mode = readMode(cookies().get(THEME_COOKIE)?.value);
  return (
    // No data-mode at all means "follow the system", which the
    // prefers-color-scheme block in lib/theme.css answers. Absent is a third
    // state, not a synonym for light.
    <html lang="en" data-livery={LIVERY} {...(mode ? { "data-mode": mode } : {})}>
      <body>
        {/* One switch per page. lib/theme.css hides .pd-modes under
            [data-embedded], so a tool's own switch disappears when the hub
            frames it and the hub's own remains.

            `self !== top` is a reference comparison, which is allowed
            cross-origin; reading a property of `top` is what throws. If it
            throws anyway, a throw means framed, so stamp regardless. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(self!==top)document.documentElement.setAttribute("data-embedded","1")}catch(e){document.documentElement.setAttribute("data-embedded","1")}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
