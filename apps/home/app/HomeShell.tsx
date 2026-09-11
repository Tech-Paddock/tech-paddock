"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Glance } from "@/lib/glance";
import GlancePanel from "./GlancePanel";

const APPS = [
  { slug: "editor", name: "Message Editor", href: "https://editor.techpaddock.io", team: "ferrari", icon: "✉️" },
  { slug: "tracker", name: "Pipeline Tracker", href: "https://tracker.techpaddock.io", team: "mercedes", icon: "📊" },
  { slug: "resume", name: "Resume Formatter", href: "https://resume.techpaddock.io", team: "astonmartin", icon: "📄" },
];

function Shell({ glance }: { glance: Glance }) {
  const router = useRouter();
  const params = useSearchParams();
  const slugParam = params.get("app");
  const selectedIndex = APPS.findIndex((a) => a.slug === slugParam);
  const selected = selectedIndex === -1 ? null : selectedIndex;
  const [loggingOut, setLoggingOut] = useState(false);

  function select(i: number) {
    router.replace(`/?app=${APPS[i].slug}`);
  }

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  }

  return (
    <main className="page">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="topbar-badge icon">🏁</span>
          <span className="topbar-title">Paddock</span>
        </div>
      </header>
      <div className="shell">
        <nav className="sidebar">
          <p className="sidebar-label">Navigate</p>
          <button
            className={`nav-item ${selected === null ? "active" : ""}`}
            onClick={() => router.replace("/")}
          >
            <span className="icon">🏁</span> Paddock
          </button>
          {APPS.map((a, i) => (
            <button
              key={a.name}
              className={`nav-item ${i === selected ? "active" : ""}`}
              onClick={() => select(i)}
            >
              <span className="icon">{a.icon}</span> {a.name}
            </button>
          ))}
          <p className="sidebar-label">Account</p>
          <button className="nav-item logout-item" onClick={logout} disabled={loggingOut}>
            <span className="icon">🚪</span> {loggingOut ? "Logging out…" : "Log out"}
          </button>
        </nav>
        <section className="content">
          {selected === null ? (
            <div className="landing">
              <GlancePanel glance={glance} />
              <div className="app-buttons">
                {APPS.map((a, i) => (
                  <button
                    key={a.name}
                    className={`app-button team-${a.team}`}
                    onClick={() => select(i)}
                  >
                    <span className="app-button-icon icon">{a.icon}</span>
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <iframe
              key={APPS[selected].href}
              src={APPS[selected].href}
              title={APPS[selected].name}
              className="app-frame"
            />
          )}
        </section>
      </div>
    </main>
  );
}

export default function HomeShell({ glance }: { glance: Glance }) {
  return (
    <Suspense fallback={null}>
      <Shell glance={glance} />
    </Suspense>
  );
}
