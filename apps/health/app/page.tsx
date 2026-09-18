import { LIVERIES } from "@/lib/theme";
import { LIVERY } from "@/lib/livery";

export const dynamic = "force-dynamic";

/**
 * Day one. The folder exists so the app builds, deploys and sits behind the
 * password gate; **nothing here is the product.**
 *
 * The design is agreed and written down at `.claude/HEALTH-PLAN.md`, and the
 * agent that will build it runs under `.claude/agents/health/RULES.md`. This
 * page is deliberately a placeholder rather than a first guess at the real one:
 * the standup protocol says a scaffold built before the design is a set of
 * decisions nobody made, and the design belongs to the agent that owns it.
 */
export default function Page() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <p className="text-xs uppercase tracking-widest opacity-60">Paddock</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Health</h1>

      <p className="mt-6 max-w-prose opacity-80">
        Scaffolded and not yet built. This app records what you ate, reads it into macros, and
        keeps the day&rsquo;s running total.
      </p>

      <dl className="mt-10 grid gap-3 text-sm">
        <div className="flex gap-3">
          <dt className="w-32 shrink-0 opacity-60">Design</dt>
          <dd><code>.claude/HEALTH-PLAN.md</code></dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-32 shrink-0 opacity-60">Charter</dt>
          <dd><code>.claude/agents/health/RULES.md</code></dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-32 shrink-0 opacity-60">Livery</dt>
          <dd>
            {LIVERIES[LIVERY].name} &mdash; borrowed from the paused tracker, and TechPad
            Gen&rsquo;s to confirm or replace
          </dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-32 shrink-0 opacity-60">Health check</dt>
          <dd><a className="underline" href="/api/health">/api/health</a></dd>
        </div>
      </dl>
    </main>
  );
}
