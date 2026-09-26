"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LIVERY } from "@/lib/livery";
import ThemeControl, { LiveryBadge } from "./ThemeControl";
import { APPS, selectedIndexFrom } from "./apps";

/**
 * Home's chrome — topbar, sidebar, and the box everything else renders into.
 *
 * It takes `children` rather than the data any particular page needs, which is
 * what lets The Garage sit inside it: that tab is an async server component
 * running live probes, so it can never be rendered *by* a client component, but
 * it can be passed *through* one.
 *
 * Rendered from the (shell) route group's layout, so it survives navigation
 * between the routes inside that group instead of remounting. `/login` is
 * outside the group deliberately — it is the pre-auth page and must not have a
 * sidebar offering links it cannot follow.
 */

// The tool list and its icons are in ./apps.ts, shared with the server-rendered
// landing. The --tone-*-bg tokens the old landing tiles read still exist in
// lib/theme.css, which is byte-identical in every app — retiring them is a theme
// change across all of them rather than part of removing this app's tiles.

function Bar({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [loggingOut, setLoggingOut] = useState(false);

  // A tool is only ever selected on the landing route.
  const selected = pathname === "/" ? selectedIndexFrom(params.get("app")) : null;
  const onLanding = selected === null;
  const onGarage = onLanding && params.get("tab") === "garage";

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
              {selected !== null
                ? `Working in ${APPS[selected].name}`
                : onGarage
                  ? "The Garage — what is wrong right now"
                  : "Pit Wall — open work, and who acts next"}
            </span>
          </div>
          {/* Switch with the brand, livery hard right — Joel's arrangement,
              2026-09-19. The livery goes right because it is the one thing on
              this bar that also appears on the bar of whatever tool is framed
              below it, and the two want to line up; the switch comes left
              because it is a control and belongs with the thing it controls.
              The livery is fixed for this app, so only the switch does
              anything, and what it does is shared with every subdomain. */}
          <ThemeControl />
          <LiveryBadge livery={LIVERY} />
        </div>
      </header>
      <div className="shell">
        <nav className="sidebar">
          <p className="sidebar-label">Navigate</p>
          {/* Links rather than buttons, so they work from any route in the
              group. Each is a same-route query change, client-side. Home
              holds both tabs, the Pit Wall and The Garage. */}
          <Link className={`nav-item ${onLanding ? "active" : ""}`} href="/">
            <span className="icon">🏁</span> Home
          </Link>
          {APPS.map((a, i) => (
            <Link
              key={a.slug}
              className={`nav-item ${i === selected ? "active" : ""}`}
              href={`/?app=${a.slug}`}
              replace
            >
              <span className="icon">{a.icon}</span> {a.name}
            </Link>
          ))}
          <p className="sidebar-label">Account</p>
          <button className="nav-item logout-item" onClick={logout} disabled={loggingOut}>
            <span className="icon">🚪</span> {loggingOut ? "Logging out…" : "Log out"}
          </button>
        </nav>
        <section className="content">{children}</section>
      </div>
    </main>
  );
}

export default function Chrome({ children }: { children: React.ReactNode }) {
  // useSearchParams needs a suspense boundary during static rendering.
  return (
    <Suspense fallback={null}>
      <Bar>{children}</Bar>
    </Suspense>
  );
}
