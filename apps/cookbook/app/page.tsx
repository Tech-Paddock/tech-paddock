import ThemeControl, { LiveryBadge } from "./ThemeControl";
import { LIVERY } from "@/lib/livery";

export const dynamic = "force-dynamic";

/**
 * **A scaffold, not a design.** The standup protocol splits this deliberately:
 * the technical director builds the folder so the app deploys, is measured and
 * is reachable behind the password; the Cookbook agent designs what is on it.
 *
 * Shipping a guessed index here would be worse than shipping nothing, because
 * a screen that already exists is the thing an agent edits rather than the
 * thing it designs. The surface is settled — *site*, a thin index grouped by
 * verb around a long page — and what fills it is the agent's first real job.
 */
export default function Page() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center gap-2 border-b-4 border-accent bg-bar px-4 py-3 text-bar-ink">
        <h1 className="text-lg font-semibold tracking-tight">Cookbook</h1>
        <ThemeControl onBar />
        <div className="ml-auto flex items-center gap-2">
          <LiveryBadge livery={LIVERY} onBar />
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        <p className="text-base font-medium">Scaffolded, not built.</p>
        <p className="text-sm opacity-80">
          The app folder, the <code>cookbook</code> schema and the password gate are
          in place so this deploys and is measurable. The book itself is the Cookbook
          agent&rsquo;s to design, starting from its charter at{" "}
          <code>.claude/agents/cookbook/RULES.md</code> and the design record kept on{" "}
          <code>claude/health-recipes</code>.
        </p>
        <p className="text-sm opacity-80">
          Surface is settled: <strong>site</strong>. A thin index grouped by verb
          around one long page &mdash; not one thumb-first screen.
        </p>
      </div>
    </main>
  );
}
