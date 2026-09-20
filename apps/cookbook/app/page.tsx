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
 * So this is **a thin index grouped by verb wrapping one long page**, not a screen
 * and not a tab bar. The three links below are the index; everything they point at
 * is on this route. Scrolling past a section beats finding a route, and nothing
 * here is designed around a thumb at a worktop the way Coffee and Health are.
 *
 * **No home-screen install**, which is why `layout.tsx` carries no `appleWebApp`
 * metadata. A site you open when you are deciding what to cook does not earn an
 * icon.
 */
const INDEX = [
  { href: "#book", verb: "See what I could cook" },
  { href: "#add", verb: "Add a recipe" },
  { href: "#shop", verb: "Shop for it" },
];

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
        {/* The index. Grouped by verb rather than by entity, because it answers
            *what am I here to do* — "Recipes / Ingredients / List" would answer
            *what objects exist*, which is a question nobody arrives with. */}
        <nav aria-label="What you are here to do" className="flex flex-wrap gap-2">
          {INDEX.map((entry) => (
            <a
              key={entry.href}
              href={entry.href}
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-soft"
            >
              {entry.verb}
            </a>
          ))}
        </nav>

        <Cookbook />
      </div>
    </main>
  );
}
