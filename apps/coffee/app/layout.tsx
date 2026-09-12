import type { Metadata, Viewport } from "next";
import appleTouchIcon from "./apple-touch-icon.png";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coffee — Paddock",
  description: "Photograph a bag, get the roaster's brewing instructions, keep the library.",

  // Added to the home screen, this is the name under the icon. The full title
  // is too long for that and iOS truncates it to something unreadable.
  applicationName: "Coffee",
  appleWebApp: {
    capable: true,
    title: "Coffee",
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
  themeColor: "#FF8000",
  // Launched from the home screen the page fills the whole screen, including
  // under the notch and the home indicator. The body insets in globals.css are
  // what keep content clear of both.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
