import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { LIVERY } from "@/lib/livery";
import { readMode, THEME_COOKIE } from "@/lib/theme";
import "@/lib/theme.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paddock — Pipeline Tracker",
  description: "Single view of every active job-search thread.",
};

// Two entries rather than one, so the browser chrome follows the system the way
// the page does. It cannot follow an explicit cookie override — metadata is
// resolved without one — which costs a mismatched strip on the phone for anyone
// who has forced the polarity against their system setting, and nothing else.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf9ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0c10" },
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
      <body>{children}</body>
    </html>
  );
}
