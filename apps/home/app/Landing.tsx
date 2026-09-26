import Link from "next/link";
import type { ReactNode } from "react";

/**
 * What the landing route renders inside the chrome: one of two tabs, or the
 * selected tool in an iframe.
 *
 * The chrome around this lives in the (shell) layout, so nothing here draws the
 * topbar or sidebar. Selection is read from the query string rather than held
 * as state, so the sidebar, the tabs and this page agree without any of them
 * owning the others.
 *
 * **Resolved on the server, and nothing is awaited before it.** Every switch of
 * tool or tab is a query-string navigation on a dynamic page, so it re-runs the
 * page. A frame renders at once, and each tab's data loads inside its own
 * Suspense boundary (`(shell)/page.tsx`), so a tab only waits for what it shows.
 *
 * **The Pit Wall is the landing** (Joel, 2026-09-26), so an absent `?tab=`
 * means the Pit Wall. The Garage is the other tab; it replaced the Morning
 * Paper, and `/admin` redirects to it.
 *
 * **No tool tiles anywhere in here.** The sidebar lists every tool, from every
 * route in the group; one home for that list.
 */

// **`id` and `name` are deliberately not the same word.** `board` stays the id
// because it is in the query string — `/?tab=board` is a link Joel may have
// bookmarked, and renaming an id breaks a URL to rename a label.
export const TABS = [
  { id: "board", name: "Pit Wall" },
  { id: "garage", name: "The Garage" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

export function tabFrom(value: string | null | undefined): TabId {
  return TABS.find((t) => t.id === value)?.id ?? "board";
}

/**
 * A framed tool. `allow="clipboard-write"` is what lets a tool's "Copy list"
 * work in here: Chrome refuses clipboard writes from a cross-origin frame unless
 * the parent delegates the permission, so without it the button fails inside
 * home and works on the tool's own subdomain.
 */
export function Frame({ app }: { app: { href: string; name: string } }) {
  return (
    <iframe
      // Keyed so switching tools remounts rather than reusing the frame, which
      // would leave the previous tool's page showing while the next one loads.
      key={app.href}
      src={app.href}
      title={app.name}
      className="app-frame"
      allow="clipboard-write"
    />
  );
}

export function Tabs({ tab, children }: { tab: TabId; children: ReactNode }) {
  return (
    <div className="tabbed">
      <div className="tabstrip" role="tablist" aria-label="Home">
        {TABS.map((t) => (
          <Link
            key={t.id}
            role="tab"
            aria-selected={t.id === tab}
            className={`tab ${t.id === tab ? "active" : ""}`}
            href={t.id === "board" ? "/" : `/?tab=${t.id}`}
            replace
          >
            {t.name}
          </Link>
        ))}
      </div>

      {children}
    </div>
  );
}

/** What a tab shows while its sources answer — says what it is waiting on. */
export function Waiting({ on }: { on: string }) {
  return <p className="slot-note">Asking {on}…</p>;
}
