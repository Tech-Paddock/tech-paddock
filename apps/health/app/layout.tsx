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
  title: "Paddock — Health",
  description: "Record what you ate, see the macros, keep the day's running total.",

  // Added to the home screen, this is the name under the icon. The full title
  // is too long for that and iOS truncates it to something unreadable.
  applicationName: "Health",
  appleWebApp: {
    capable: true,
    title: "Health",
    statusBarStyle: "default",
  },

  // Imported rather than referenced by path, deliberately. A static import is
  // served from /_next/static, which is the one prefix this app's middleware
  // matcher excludes outright. Next's own metadata conventions (app/icon.png,
  // app/apple-icon.png) are served from routes that sit behind the password
  // gate, so iOS would fetch them, get the login redirect, and fall back to a
  // screenshot of the page as the home screen icon.
  icons: {
    apple: [{ url: appleTouchIcon.src, sizes: "180x180", type: "image/png" }],
  },
};

// Primary device is a phone standing in a kitchen.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Was a single "#FF8000", the old McLaren papaya. Two entries now, so the
  // browser chrome follows the system the way the page does. It cannot follow
  // an explicit cookie override — metadata is resolved without one — which
  // costs a mismatched strip for anyone who has forced the polarity against
  // their system setting, and nothing else.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f1e8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  // Launched from the home screen the page fills the whole screen, including
  // under the notch and the home indicator. The body insets in globals.css are
  // what keep content clear of both.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading a cookie opts this layout into dynamic rendering. That costs
  // nothing here: every route in this app already goes through the password
  // gate in middleware.ts, so none of them was ever served from a static cache.
  // What it buys is the polarity being correct in the very first byte of HTML,
  // with no blocking script and nothing to flash.
  //
  // The script below is not an exception to that. It answers a different
  // question — am I inside the hub's iframe — which no cookie can, because the
  // same cookie is set whether a tool is framed or opened in its own tab. It is
  // synchronous so the switch it hides never renders and then vanishes.
  const mode = readMode(cookies().get(THEME_COOKIE)?.value);
  return (
    // No data-mode at all means "follow the system", which the
    // prefers-color-scheme block in lib/theme.css answers. Absent is a third
    // state, not a synonym for light.
    <html lang="en" data-livery={LIVERY} {...(mode ? { "data-mode": mode } : {})}>
      <body>
        {/* One switch per page. lib/theme.css hides .pd-modes under
            [data-embedded], so a tool's own switch disappears when the hub
            frames it and the hub's own remains — see ThemeControl.tsx for the
            other half, which is what makes hiding it safe.

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
