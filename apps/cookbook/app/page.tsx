import ThemeControl, { LiveryBadge } from "./ThemeControl";
import Cookbook from "./Cookbook";
import { LIVERY } from "@/lib/livery";

export const dynamic = "force-dynamic";

/**
 * The Cookbook, as one page.
 *
 * **Surface is settled: site**, at standup on 2026-09-20, and the reasoning is in
 * `.claude/SURFACE.md` where this tool is the worked example — a cookbook is a
 * collection, and for a collection the index *is* the product. You arrive to see
 * what you could cook, which answers the second question *site* plainly.
 *
 * **That is no longer what this renders, and the gap is deliberate.** Joel asked
 * for tabs on 2026-09-22 and the index that used to sit here — three pills by verb
 * — went with them, because an index above a tab bar is two navigations for one
 * page. The tabs are in `Cookbook.tsx` and are state, not routes: this is still
 * one route, still not thumb-first, still no home-screen install.
 *
 * **`SURFACE.md` has not caught up and says so here rather than quietly.** It
 * defines *site* as one long page and uses this app as the example. Bringing it
 * and `CLAUDE.md` in line is the technical director's; the note is in this seat's
 * `HANDOFF.md`.
 *
 * **No home-screen install**, which is why `layout.tsx` carries no `appleWebApp`
 * metadata. A site you open when you are deciding what to cook does not earn an
 * icon.
 */

export default function Page() {
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

        <Cookbook />
      </div>
    </main>
  );
}
