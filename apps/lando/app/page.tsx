import ThemeControl, { LiveryBadge } from "./ThemeControl";
import LogoutControl from "./LogoutControl";
import Journal from "./Journal";
import { LIVERY } from "@/lib/livery";

export const dynamic = "force-dynamic";

/**
 * One screen, thumb-first, opening on the since-last clocks and the log
 * buttons (charter, Scope). Timeline and growth chart sit below on the same
 * screen; there is no second page.
 */
export default function Page() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center gap-2 border-b-4 border-accent bg-bar px-4 py-3 text-bar-ink">
        <h1 className="text-lg font-semibold tracking-tight">Lando</h1>
        <ThemeControl onBar />
        <LogoutControl onBar />
        <div className="ml-auto flex items-center gap-2">
          <LiveryBadge livery={LIVERY} onBar />
        </div>
      </header>

      <div className="mx-auto max-w-md px-4 py-4">
        <Journal />
      </div>
    </main>
  );
}
