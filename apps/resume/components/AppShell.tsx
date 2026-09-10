"use client";

import { ReactNode } from "react";

const TOOLS = [
  { slug: "editor", name: "Message Editor", href: "https://editor.techpaddock.io", icon: "✉️" },
  { slug: "tracker", name: "Pipeline Tracker", href: "https://tracker.techpaddock.io", icon: "📊" },
  { slug: "resume", name: "Resume Formatter", href: "https://resume.techpaddock.io", icon: "📄" },
] as const;

export default function AppShell({
  active,
  icon,
  title,
  sidebarExtra,
  children,
}: {
  active: (typeof TOOLS)[number]["slug"];
  icon: string;
  title: string;
  sidebarExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-ink border-b-4 border-accent">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-md bg-accent flex items-center justify-center text-sm">
              {icon}
            </span>
            <span className="text-white font-semibold text-sm">{title}</span>
          </div>
          <a
            href="https://techpaddock.io"
            target="_top"
            className="text-white/60 text-xs hover:text-white"
          >
            ← Paddock
          </a>
        </div>
      </header>
      <div className="flex-1 max-w-6xl mx-auto w-full flex">
        <nav className="w-52 flex-shrink-0 border-r border-line px-3 py-6 flex flex-col gap-0.5 text-sm">
          <a
            href="https://techpaddock.io"
            target="_top"
            className="text-xs text-ink/50 hover:text-ink px-2 mb-4"
          >
            ‹ Paddock
          </a>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/40 px-2 mb-1">
            Tools
          </p>
          {TOOLS.map((t) => (
            <a
              key={t.slug}
              href={t.href}
              target="_top"
              className={`px-2 py-1.5 rounded-md ${
                t.slug === active
                  ? "bg-ink text-white font-bold"
                  : "text-ink font-normal hover:bg-paper"
              }`}
            >
              {t.icon} {t.name}
            </a>
          ))}
          {sidebarExtra}
        </nav>
        <main className="flex-1 min-w-0 px-6 py-8 flex flex-col gap-6">{children}</main>
      </div>
    </div>
  );
}
