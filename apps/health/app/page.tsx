import Link from "next/link";
import ThemeControl, { LiveryBadge } from "./ThemeControl";
import Logger from "./Logger";
import { LIVERY } from "@/lib/livery";

export const dynamic = "force-dynamic";

/**
 * One screen, thumb-first, no index — the surface this tool was settled as.
 *
 * One place to go from here, in the footer rather than in a tab: the debug
 * harness validates the model rather than logging a meal, so it does not earn
 * a tab and the one screen stays one screen. The grocery list lived here too
 * until it moved to the Cookbook (TEC-15); `/list` now only redirects there.
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
