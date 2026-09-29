import Link from "next/link";
import ThemeControl, { LiveryBadge } from "./ThemeControl";
import LogoutControl from "./LogoutControl";
import Logger from "./Logger";
import { LIVERY } from "@/lib/livery";

export const dynamic = "force-dynamic";

/**
 * One screen, thumb-first, no index — the surface this tool was settled as.
 *
 * Two places to go from here, in the footer rather than in tabs: setting a
 * target is a different moment from logging a meal (Joel, 2026-09-29), and the
 * debug harness validates the model rather than logging one. Neither earns a
 * tab, so the log stays the app. The grocery list lived here too until it
 * moved to the Cookbook (TEC-15); `/list` now only redirects there.
 */
export default function Page() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center gap-2 border-b-4 border-accent bg-bar px-4 py-3 text-bar-ink">
        <h1 className="text-lg font-semibold tracking-tight">Health</h1>
        <ThemeControl onBar />
        <LogoutControl onBar />
        <div className="ml-auto flex items-center gap-2">
          <LiveryBadge livery={LIVERY} onBar />
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-5">
        <Logger />

        <footer className="flex flex-col gap-2 border-t border-line pt-4 text-xs text-ink-soft">
          <div>
            <Link href="/targets" className="underline decoration-dotted underline-offset-2">
              Targets
            </Link>
            <span> — set the day&rsquo;s calories and how they split.</span>
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
