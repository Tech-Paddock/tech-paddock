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
 * page. It used to fetch the glance and the Pit Wall first — GitHub and the
 * tracker, up to four seconds each — before it would show even an iframe that
 * needed neither. Now a frame renders at once, and each tab's data loads inside
 * its own Suspense boundary (`(shell)/page.tsx`), so a tab only waits for what
 * it shows.
 *
 * **Paper is the landing**, per the settled decision, so an absent `?tab=` means
 * Paper rather than the Pit Wall. There are two tabs; the Feed was deleted
 * rather than parked on 2026-09-18.
 *
 * **No tool tiles anywhere in here.** The sidebar lists every tool, from every
 * route in the group; one home for that list.
 *
 * Density rides in the query string too — a prototype decision that makes the
 * two densities trivially comparable and shareable. If it should be remembered
 * per person, that is a cookie like polarity's.
 */

// **`id` and `name` are deliberately not the same word.** `board` stays the id
// because it is in the query string — `/?tab=board` is a link Joel may have
// bookmarked, and renaming an id breaks a URL to rename a label.
export const TABS = [
  { id: "paper", name: "Paper" },
  { id: "board", name: "Pit Wall" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

export type Density = "dispatch" | "timing";

export const DENSITIES: { id: Density; name: string; note: string }[] = [
  { id: "dispatch", name: "Dispatch", note: "Room to read" },
  { id: "timing", name: "Timing", note: "Everything at once" },
];

export function tabFrom(value: string | null | undefined): TabId {
  return TABS.find((t) => t.id === value)?.id ?? "paper";
}

export function densityFrom(value: string | null | undefined): Density {
  return DENSITIES.find((d) => d.id === value)?.id ?? "dispatch";
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

export function Tabs({ tab, density, children }: { tab: TabId; density: Density; children: ReactNode }) {
  return (
    <div className="tabbed">
      <div className="tabstrip" role="tablist" aria-label="Pit Wall">
        {TABS.map((t) => (
          <Link
            key={t.id}
            role="tab"
            aria-selected={t.id === tab}
            className={`tab ${t.id === tab ? "active" : ""}`}
            href={t.id === "paper" ? "/" : `/?tab=${t.id}`}
            replace
          >
            {t.name}
          </Link>
        ))}

        {/* Only the Paper has densities, so the control only appears with it
            rather than sitting greyed out on the other tab. */}
        {tab === "paper" && (
          <span className="tab-densities" role="group" aria-label="Density">
            {DENSITIES.map((d) => (
              <Link
                key={d.id}
                aria-pressed={d.id === density}
                className={`tab-density ${d.id === density ? "active" : ""}`}
                href={d.id === "dispatch" ? "/" : `/?density=${d.id}`}
                title={d.note}
                replace
              >
                {d.name}
              </Link>
            ))}
          </span>
        )}
      </div>

      {children}
    </div>
  );
}

/** What a tab shows while its sources answer — says what it is waiting on. */
export function Waiting({ on }: { on: string }) {
  return <p className="slot-note">Asking {on}…</p>;
}
