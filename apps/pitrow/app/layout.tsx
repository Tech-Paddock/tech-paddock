import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import appleTouchIcon from "./apple-touch-icon.png";
import { LIVERY } from "@/lib/livery";
import { readMode, THEME_COOKIE } from "@/lib/theme";
import "@/lib/theme.css";
import "./globals.css";

export const metadata: Metadata = {
  // "Paddock — X" in every app: a tab truncates from the right.
  title: "Paddock — Pit Row",
  description: "The household board: this week's events and the chores due.",

  // Added to the home screen, this is the name under the icon.
  applicationName: "Pit Row",
  appleWebApp: {
    capable: true,
    title: "Pit Row",
    statusBarStyle: "default",
  },
  // Next 16 renders `appleWebApp.capable` as the unprefixed tag only; the
  // prefixed one is what an iPhone home-screen install reads to open without
  // Safari's chrome.
  other: { "apple-mobile-web-app-capable": "yes" },

  // Imported rather than referenced by path: a static import is served from
  // /_next/static, which the gate's matcher (proxy.ts) excludes. Next's own
  // app/apple-icon.png route sits behind the password, so iOS would get the
  // login redirect. The manifest is linked in the body below, not here: see
  // app/app.webmanifest/route.ts.
  icons: {
    apple: [{ url: appleTouchIcon.src, sizes: "180x180", type: "image/png" }],
  },
};

// An iPad left on in the house, and a phone beside it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    // clark paper, light and dark, copied from lib/theme.css.
    { media: "(prefers-color-scheme: light)", color: "#f1f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#1a241f" },
  ],
  // Launched from the home screen the page runs under the notch; the body
  // insets in globals.css keep content clear of it.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The polarity cookie, read here so the first byte of HTML is right. The
  // script below answers a different question — am I inside the hub's iframe.
  const mode = readMode((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" data-livery={LIVERY} {...(mode ? { "data-mode": mode } : {})}>
      <body>
        {/* React hoists this into <head>. use-credentials sends the session
            cookie, without which the gate redirects the manifest to /login. */}
        <link rel="manifest" href="/app.webmanifest" crossOrigin="use-credentials" />
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
