import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import appleTouchIcon from "./apple-touch-icon.png";
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

  // **On the home screen, by Joel's word** (2026-10-05), overruling the site
  // call that left it off: the No. 12 tab icon becomes the app icon. Same
  // shape as Coffee and Health. The short name is what iOS prints under the
  // icon; "Paddock — Cookbook" is too long for that and gets truncated.
  applicationName: "Cookbook",
  appleWebApp: {
    capable: true,
    title: "Cookbook",
    statusBarStyle: "default",
  },

  // Imported rather than referenced by path, deliberately — Coffee's reasoning.
  // A static import is served from /_next/static, which the middleware matcher
  // excludes outright. Next's own app/apple-icon.png route sits behind the
  // password gate, so iOS would get the login redirect and fall back to a
  // screenshot. The PNG is `icon.svg` drawn full-bleed at 180px: iOS rounds the
  // corners itself, and the SVG's own would show as white wedges.
  icons: {
    apple: [{ url: appleTouchIcon.src, sizes: "180x180", type: "image/png" }],
  },
};

// You are sitting down with a laptop or standing with a phone, but either way
// you arrive to browse rather than to do one known thing. **No `viewportFit:
// "cover"`, even launched from the home screen**: with the default status bar
// style iOS keeps the page below the bar, so nothing here needs safe-area
// padding — Coffee and Health use "cover" and pay for it in their CSS.
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
