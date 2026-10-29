import ThemeControl, { LiveryBadge } from "./ThemeControl";
import LogoutControl from "./LogoutControl";
import Journal from "./Journal";
import { MealsBadge, MealsProvider } from "./Meals";
import { LIVERY } from "@/lib/livery";

export const dynamic = "force-dynamic";

/**
 * The app bar, then four tabs, Log, Analytics, What's new and Upcoming, opening on Log (RULES.md,
 * Surface: app, the owner's override, 2026-10-20). One-handed, thumb-first. The tabs
 * and all panels are `Journal`, so they share one read of the journal; the
 * bar shows its count of today's meals (TEC-142).
 */
export default function Page() {
  return (
    <MealsProvider>
      <main className="min-h-screen">
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b-4 border-accent bg-bar px-3 py-2.5 text-bar-ink">
          <h1 className="text-lg font-semibold tracking-tight">Lando</h1>
          <ThemeControl onBar />
          <LogoutControl onBar />
          <div className="ml-auto flex items-center gap-2">
            <MealsBadge />
            <LiveryBadge livery={LIVERY} onBar />
          </div>
        </header>

        <Journal />
      </main>
    </MealsProvider>
  );
}
