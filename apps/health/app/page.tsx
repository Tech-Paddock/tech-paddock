import Link from "next/link";
import ThemeControl, { LiveryBadge } from "./ThemeControl";
import LogoutControl from "./LogoutControl";
import Logger from "./Logger";
import { LIVERY } from "@/lib/livery";

export const dynamic = "force-dynamic";

/**
 * One screen, thumb-first, no index — the surface this tool was settled as.
 *
 * One place to go from here, in the footer rather than in tabs: setting a
 * target is a different moment from logging a meal, which does not earn a tab,
 * so the log stays the app. The model comparison under `/debug` went with
 * TEC-133 (one model, no comparison). The grocery list lived here too until it
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
        </footer>
      </div>
    </main>
  );
}
