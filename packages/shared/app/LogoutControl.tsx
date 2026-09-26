"use client";

import { useState } from "react";

/**
 * The header's Log out control. Byte-identical in every app, stamped from
 * packages/shared like ThemeControl beside it, and styled from the same plain
 * classes in lib/theme.css so one file drops into the hub and the Tailwind
 * tools alike.
 *
 * **Logging out here logs you out everywhere.** The session cookie is scoped to
 * .techpaddock.io, so the handler behind /api/logout clears it for every
 * subdomain at once. The title says so, because a control that looks local and
 * acts global is a surprise the first time.
 *
 * **It never pretends.** The browser only goes to /login once the server has
 * answered. A 401 counts as success: the middleware answers 401 to a request
 * with no valid session, so the cookie is already gone or already worthless.
 * Anything else — a 5xx, a network failure — leaves you where you are and says
 * the logout did not happen, because landing on /login while still signed in
 * is the one outcome worse than a visible error.
 *
 * **Hidden inside the hub's frames** (`[data-embedded] .pd-logout` in
 * lib/theme.css), like the light/dark switch. The hub carries its own, and a
 * framed tool's would log out and then show a login page inside one panel
 * while the hub around it stayed up.
 */
function Door() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H14" />
      <path d="M10 12h10M16.5 8.5 20 12l-3.5 3.5" />
    </svg>
  );
}

type State = "idle" | "working" | "failed";

export default function LogoutControl({ onBar = false }: { onBar?: boolean }) {
  const [state, setState] = useState<State>("idle");

  async function logout() {
    setState("working");
    let done = false;
    try {
      const res = await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
      done = res.ok || res.status === 401;
    } catch {
      done = false;
    }
    if (done) {
      window.location.assign("/login");
      return;
    }
    setState("failed");
  }

  const label = state === "working" ? "Logging out…" : state === "failed" ? "Log out failed — retry" : "Log out";

  return (
    <button
      type="button"
      className={onBar ? "pd-logout pd-on-bar" : "pd-logout"}
      onClick={logout}
      disabled={state === "working"}
      data-state={state}
      title="Log out of every Paddock app — the sign-in is shared across techpaddock.io"
      aria-label={state === "idle" ? "Log out of every Paddock app" : undefined}
    >
      <Door />
      <span className="pd-logout-label" role={state === "failed" ? "alert" : undefined}>
        {label}
      </span>
    </button>
  );
}
