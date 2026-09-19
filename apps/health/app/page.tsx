import Link from "next/link";
import ThemeControl, { LiveryBadge } from "./ThemeControl";
import Logger from "./Logger";
import { LIVERY } from "@/lib/livery";

export const dynamic = "force-dynamic";

/**
 * One screen, thumb-first, no index — the surface this tool was settled as.
 *
 * Three places to go from here, all in the footer rather than in tabs. The
 * debug harness validates the model rather than logging a meal; the grocery
 * list is the shop; the recipe book is deciding what to cook. **None of them
 * is the moment you are in while logging lunch**, which is the rule Joel
 * approved on 2026-09-19 — a screen earns its place by being a different
 * moment, not a different noun — so none of them earns a tab.
 */
export default function Page() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center gap-2 border-b-4 border-accent bg-bar px-4 py-3 text-bar-ink">
        <h1 className="text-lg font-semibold tracking-tight">Health</h1>
        <ThemeControl onBar />
        <div className="ml-auto flex items-center gap-2">
          <LiveryBadge livery={LIVERY} onBar />
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-5">
        <Logger />

        <footer className="flex flex-col gap-2 border-t border-line pt-4 text-xs text-ink-soft">
          <div>
            <Link href="/recipes" className="underline decoration-dotted underline-offset-2">
              Recipe book
            </Link>
            <span> — write one, ask for one, or import one; then log it by the serving.</span>
          </div>
          <div>
            <Link href="/list" className="underline decoration-dotted underline-offset-2">
              Grocery list
            </Link>
            <span> — what to buy, as text you copy or a search you tap.</span>
          </div>
          <div>
            <Link href="/debug" className="underline decoration-dotted underline-offset-2">
              Model comparison
            </Link>
            <span> — run both models on one food and keep the better answer.</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
