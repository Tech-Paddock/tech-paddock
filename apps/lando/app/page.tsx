import ThemeControl, { LiveryBadge } from "./ThemeControl";
import LogoutControl from "./LogoutControl";
import Journal from "./Journal";
import { LIVERY } from "@/lib/livery";

export const dynamic = "force-dynamic";

/**
 * The app bar, then two tabs, Log and Analytics, opening on Log (charter,
 * Scope: the owner's override, 2026-10-20). One-handed, thumb-first. The tabs
 * and both panels are `Journal`, so they share one read of the journal.
 */
export default function Page() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center gap-2 border-b-4 border-accent bg-bar px-3 py-2.5 text-bar-ink">
        <h1 className="text-lg font-semibold tracking-tight">Lando</h1>
        <ThemeControl onBar />
        <LogoutControl onBar />
        <div className="ml-auto flex items-center gap-2">
          <LiveryBadge livery={LIVERY} onBar />
        </div>
      </header>

      <Journal />
    </main>
  );
}
