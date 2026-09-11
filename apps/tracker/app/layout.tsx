import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paddock — Pipeline Tracker",
  description: "Single view of every active job-search thread.",
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
