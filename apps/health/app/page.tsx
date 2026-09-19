import Link from "next/link";
import ThemeControl, { LiveryBadge } from "./ThemeControl";
import Logger from "./Logger";
import { LIVERY } from "@/lib/livery";

export const dynamic = "force-dynamic";

/**
 * One screen, thumb-first, no index — the surface this tool was settled as.
 *
 * Two places to go from here, both in the footer rather than in tabs. The
 * debug harness validates the model rather than logging a meal. The grocery
 * list is the other half of eating deliberately, but you are not on it while
 * you are logging — so neither earns a tab, and the one screen stays one
 * screen.
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
