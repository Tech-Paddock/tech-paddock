import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coffee — Paddock",
  description: "Photograph a bag, get the roaster's brewing instructions, keep the library.",
};

// Primary device is a phone standing in a kitchen.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FF8000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
