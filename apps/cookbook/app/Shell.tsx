import ThemeControl, { LiveryBadge } from "./ThemeControl";
import Cookbook, { type Tab } from "./Cookbook";
import { LIVERY } from "@/lib/livery";

/**
 * The page every route in this app renders: the bar, then the two tabs.
 *
 * **Surface is settled: site**, at standup on 2026-09-20 — a cookbook is a
 * collection, and for a collection the index *is* the product. Its tabs are that
 * index, one verb each (the technical director's ruling on 2026-09-24, after Joel
 * asked for tabs on 2026-09-22), and `.claude/SURFACE.md` holds the reasoning.
 *
 * **Each tab has an address** (TEC-22, 2026-09-25): `/` opens on the book and
 * `/list` opens on the King Soopers list. The list needed one because Health's
 * `/list` redirects onto it while the grocery list moves here (TEC-15), and a
 * redirect needs somewhere to land that is the list rather than the book. Both
 * routes render this one component, so they cannot drift into two pages.
 *
 * **No home-screen install**, which is why `layout.tsx` carries no `appleWebApp`
 * metadata. A site you open when you are deciding what to cook does not earn an
 * icon.
 */
export default function Shell({ tab }: { tab: Tab }) {
  return (
    <main className="min-h-screen">
      <header className="flex items-center gap-2 border-b-4 border-accent bg-bar px-4 py-3 text-bar-ink">
        <h1 className="text-lg font-semibold tracking-tight">Cookbook</h1>
        <ThemeControl onBar />
        <div className="ml-auto flex items-center gap-2">
          <LiveryBadge livery={LIVERY} onBar />
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
        <Cookbook initialTab={tab} />
      </div>
    </main>
  );
}
