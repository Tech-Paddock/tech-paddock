"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Glance } from "@/lib/glance";
import { TOOLS, type ToolSlug } from "@/lib/platform";
import GlancePanel from "./GlancePanel";

/** A step on the hub's gold ramp. Each has a `.tone-*` rule in globals.css. */
type Tone = "champagne" | "gold" | "brass" | "bronze";

// Names and URLs come from lib/platform.ts so the shell and the admin page
// cannot drift apart; only presentation lives here. Typing this as a Record
// over ToolSlug means adding a tool to that file breaks this build until it is
// given a colour and an icon — rather than rendering an unstyled tile.
const PRESENTATION: Record<ToolSlug, { tone: Tone; icon: string }> = {
  editor: { tone: "champagne", icon: "✉️" },
  tracker: { tone: "gold", icon: "📊" },
  resume: { tone: "brass", icon: "📄" },
  coffee: { tone: "bronze", icon: "☕" },
};

const APPS = TOOLS.map((tool) => ({
  slug: tool.slug,
  name: tool.name,
  href: tool.url,
  ...PRESENTATION[tool.slug],
}));

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
          <a className="nav-item" href="/admin">
            <span className="icon">🔧</span> Admin
          </a>
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
                    className={`app-button tone-${a.tone}`}
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
