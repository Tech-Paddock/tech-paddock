"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TOOLS, type ToolSlug } from "@/lib/platform";
import { LIVERY } from "@/lib/livery";
import ThemeControl, { LiveryBadge } from "./ThemeControl";

/**
 * The hub's chrome — topbar, sidebar, and the box everything else renders into.
 *
 * It takes `children` rather than the data any particular page needs, which is
 * what lets `/admin` sit inside it: that page is an async server component
 * running live probes, so it can never be rendered *by* a client component, but
 * it can be passed *through* one.
 *
 * Rendered from the (shell) route group's layout, so it survives navigation
 * between the routes inside that group instead of remounting. `/login` is
 * outside the group deliberately — it is the pre-auth page and must not have a
 * sidebar offering links it cannot follow.
 */

// Names and URLs come from lib/platform.ts so the chrome and the admin page
// cannot drift apart; only presentation lives here. Typing this as a Record over
// ToolSlug means adding a tool to that file breaks this build until it is given
// an icon — rather than rendering a nameless blank in the sidebar.
//
// It carried a `tone` off the livery's four-step gold ramp until the landing's
// tiles were removed: the sidebar is the only place a tool is listed now, and it
// draws every row the same. The --tone-*-bg tokens those steps read still exist
// in lib/theme.css, which is byte-identical in all five apps — retiring them is a
// theme change across all of them rather than part of removing this app's tiles.
const PRESENTATION: Record<ToolSlug, { icon: string }> = {
  resume: { icon: "📄" },
  coffee: { icon: "☕" },
  health: { icon: "🥗" },
};

export const APPS = TOOLS.map((tool) => ({
  slug: tool.slug,
  name: tool.name,
  href: tool.url,
  ...PRESENTATION[tool.slug],
}));

/** Which tool `?app=` names, or null for the landing. Shared with Landing. */
export function selectedIndexFrom(slug: string | null) {
  const i = APPS.findIndex((a) => a.slug === slug);
  return i === -1 ? null : i;
}

function Bar({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [loggingOut, setLoggingOut] = useState(false);

  const onAdmin = pathname === "/admin";
  // A tool is only ever selected on the landing route; /admin has no ?app=.
  const selected = onAdmin ? null : selectedIndexFrom(params.get("app"));
  const onLanding = !onAdmin && selected === null;

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
              {onAdmin
                ? "The garage — declared against reported"
                : selected === null
                  ? "What needs you, with several agents out"
                  : `Working in ${APPS[selected].name}`}
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
              group. On the landing this is a same-route query change; from
              /admin it is a route change. Both are client-side. */}
          <Link className={`nav-item ${onLanding ? "active" : ""}`} href="/">
            <span className="icon">🏁</span> Pit Wall
          </Link>
          {APPS.map((a, i) => (
            <Link
              key={a.slug}
              className={`nav-item ${i === selected ? "active" : ""}`}
              href={`/?app=${a.slug}`}
              replace={!onAdmin}
            >
              <span className="icon">{a.icon}</span> {a.name}
            </Link>
          ))}
          <p className="sidebar-label">Account</p>
          <Link className={`nav-item ${onAdmin ? "active" : ""}`} href="/admin">
            <span className="icon">🔧</span> The Garage
          </Link>
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
