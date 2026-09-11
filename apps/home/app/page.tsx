"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const APPS = [
  { slug: "editor", name: "Message Editor", href: "https://editor.techpaddock.io", team: "ferrari", icon: "✉️" },
  { slug: "tracker", name: "Pipeline Tracker", href: "https://tracker.techpaddock.io", team: "mercedes", icon: "📊" },
  { slug: "resume", name: "Resume Formatter", href: "https://resume.techpaddock.io", team: "astonmartin", icon: "📄" },
];

function HomeShell() {
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
          <div className="topbar-text">
            <span className="topbar-title">Paddock</span>
            <span className="topbar-subtitle">
              {selected === null
                ? "Your command center — pick a tool to get started"
                : `Working in ${APPS[selected].name}`}
            </span>
          </div>
        </div>
      </header>
      <div className="logout-bar">
        <button className="logout-link" onClick={logout} disabled={loggingOut}>
          <span className="icon">🚪</span> {loggingOut ? "Logging out…" : "Log out"}
        </button>
      </div>
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
        </nav>
        <section className="content">
        {selected === null ? (
          <div className="placeholder">
            <p className="eyebrow">Paddock</p>
            <h1>Pick a tool</h1>
            <p className="description">Select one to open it here.</p>
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

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeShell />
    </Suspense>
  );
}
