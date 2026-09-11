import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paddock — Resume Formatter",
  description: "Reformat a Jobright-tailored resume into your own template, optimized for ATS readability.",
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
