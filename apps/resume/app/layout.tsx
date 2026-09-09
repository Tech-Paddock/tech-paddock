import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resume Formatter — Paddock",
  description: "Single source of truth for resume content, formatted to docx on demand.",
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
