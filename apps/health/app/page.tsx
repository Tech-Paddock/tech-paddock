import Link from "next/link";
import ThemeControl, { LiveryBadge } from "./ThemeControl";
import Logger from "./Logger";
import { LIVERY } from "@/lib/livery";

export const dynamic = "force-dynamic";

/**
 * One screen, thumb-first, no index — the surface this tool was settled as.
 *
 * There is nowhere else to go from here except the debug harness, which is a
 * tool for validating the model rather than part of logging a meal, so it is a
 * quiet link rather than a tab.
 */
export default function Page() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center gap-2 border-b-4 border-accent bg-bar px-4 py-3 text-bar-ink">
        <h1 className="text-lg font-semibold tracking-tight">Health</h1>
        <LiveryBadge livery={LIVERY} onBar />
        <div className="ml-auto flex items-center gap-2">
          <ThemeControl onBar />
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-5">
        <Logger />

        <footer className="border-t border-line pt-4 text-xs text-ink-soft">
          <Link href="/debug" className="underline decoration-dotted underline-offset-2">
            Model comparison
          </Link>
          <span> — run both models on one food and keep the better answer.</span>
        </footer>
      </div>
    </main>
  );
}
