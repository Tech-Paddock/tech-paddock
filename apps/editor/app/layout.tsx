import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Message Editor — Paddock",
  description: "Draft outreach messages in your own voice.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
