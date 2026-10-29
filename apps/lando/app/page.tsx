import AppBar from "./AppBar";
import Journal from "./Journal";

export const dynamic = "force-dynamic";

/**
 * The app bar, then four tabs, Log, Analytics, What's new and Upcoming, opening on Log (RULES.md,
 * Surface: app, the owner's override, 2026-10-20). One-handed, thumb-first. The tabs
 * and all panels are `Journal`, so they share one read of the journal.
 */
export default function Page() {
  return (
    <main className="min-h-screen">
      <AppBar />
      <Journal />
    </main>
  );
}
