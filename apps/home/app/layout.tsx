import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { LIVERY } from "@/lib/livery";
import { readMode, THEME_COOKIE } from "@/lib/theme";
import "@/lib/theme.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paddock",
  description: "Personal command center.",
};

// On a `viewport` export, not `metadata` — Next deprecated the latter. Two
// entries rather than one, so the browser chrome follows the system the way the
// page does. It cannot follow an explicit cookie override — metadata is
// resolved without one — which costs a mismatched strip on the phone for anyone
// who has forced the polarity against their system setting, and nothing else.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f5f9" },
    { media: "(prefers-color-scheme: dark)", color: "#070c18" },
  ],
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
