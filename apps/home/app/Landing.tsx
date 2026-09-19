"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Glance } from "@/lib/glance";
import type { PitWall as PitWallData } from "@/lib/pitwall";
import { APPS, selectedIndexFrom } from "./Chrome";
import GlancePanel from "./GlancePanel";
import PitWall from "./PitWall";
import Paper, { DENSITIES, type Density } from "./Paper";

/**
 * What the landing route renders inside the chrome: one of three tabs, or the
 * selected tool in an iframe.
 *
 * The chrome around this lives in the (shell) layout, so nothing here draws the
 * topbar or sidebar. Selection is read from the query string rather than held
 * as state, so the sidebar, the tabs and this component agree without any of
 * them owning the others.
 *
 * **Paper is the landing**, per the settled decision, so an absent `?tab=` means
 * Paper rather than the Pit Wall. **There are two tabs, not three** — the Feed
 * was deleted rather than parked on 2026-09-18, because it was named in the tab
 * order and nowhere else and nothing said what it carried. The board did not move: it is the same PitWall and
 * glance that were here before, one tab along.
 *
 * **No tool tiles anywhere in here.** A grid of them sat under the glance on the
 * Board and duplicated the sidebar, which lists every tool from the same `APPS`
 * and is reachable from every route in the group. Joel removed the tiles: one
 * home for that list, and it is the sidebar. `APPS` is still imported — it is
 * what resolves `?app=` to the frame this renders.
 *
 * Density rides in the query string too. That is a prototype decision rather
 * than a settled one — it makes the two densities trivially comparable and
 * shareable, and it avoids inventing a persistence rule nobody has asked for.
 * If it should be remembered per person, that is a cookie like polarity's.
 */

// **`id` and `name` are deliberately not the same word.** `board` stays the id
// because it is in the query string — `/?tab=board` is a link Joel may have
// bookmarked, and renaming an id breaks a URL to rename a label. The label is
// what was wrong: "Board" named this tab *and* the thing the hub is, so the tab
// takes the real name and the id keeps the old one.
const TABS = [
  { id: "paper", name: "Paper" },
  { id: "board", name: "Pit Wall" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function tabFrom(value: string | null): TabId {
  return TABS.some((t) => t.id === value) ? (value as TabId) : "paper";
}

function densityFrom(value: string | null): Density {
  return DENSITIES.some((d) => d.id === value) ? (value as Density) : "dispatch";
}

function Board({ glance, pit }: { glance: Glance; pit: PitWallData }) {
  return (
    <div className="landing">
      <PitWall data={pit} />
      <GlancePanel glance={glance} />
    </div>
  );
}

function Body({ glance, pit }: { glance: Glance; pit: PitWallData }) {
  const params = useSearchParams();
  const selected = selectedIndexFrom(params.get("app"));

  if (selected !== null) {
    return (
      <iframe
        // Keyed so switching tools remounts rather than reusing the frame, which
        // would leave the previous tool's page showing while the next one loads.
        key={APPS[selected].href}
        src={APPS[selected].href}
        title={APPS[selected].name}
        className="app-frame"
      />
    );
  }

  const tab = tabFrom(params.get("tab"));
  const density = densityFrom(params.get("density"));

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
            rather than sitting greyed out on the other two. */}
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

      {tab === "paper" && <Paper glance={glance} density={density} />}
      {tab === "board" && <Board glance={glance} pit={pit} />}
    </div>
  );
}

export default function Landing({ glance, pit }: { glance: Glance; pit: PitWallData }) {
  return (
    <Suspense fallback={null}>
      <Body glance={glance} pit={pit} />
    </Suspense>
  );
}
