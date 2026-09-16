import { DECLARED } from "@/lib/declared.generated";
import { DRIFT } from "@/lib/drift.generated";
import { PROJECTS, type DriftCheck, type DriftState } from "@/lib/platform";
import { countByStatus, runDiagnostics, severityFor, type Probe } from "@/lib/diagnostics";

/**
 * Declared versus reported.
 *
 * The left-hand truth is the repo — committed, reviewable, and generated at
 * build time rather than typed. The right-hand truth is whatever the platform
 * says about itself right now. The gap between them is the only thing on this
 * page worth looking at, which is why nothing here is allowed to guess: an
 * unreachable check reads "unknown" and says why.
 *
 * Sits behind the hub's password gate like every other route here. It reports
 * no environment value, only whether a name is set.
 */
export const dynamic = "force-dynamic";

function ProbeRow({ probe }: { probe: Probe }) {
  return (
    <div className={`slot slot-static sev-${severityFor(probe.status)}`}>
      <span className="slot-label">{probe.status}</span>
      <span className="slot-body">
        <span className="slot-title">{probe.target}</span>
        <span className="slot-detail">{probe.detail}</span>
      </span>
      <span className="slot-count">{probe.ms === null ? "" : `${probe.ms} ms`}</span>
    </div>
  );
}

/**
 * A drift check reads like a probe, so it renders like one — same row, same
 * severity grammar. `warn` covers two different things and is deliberately not
 * split: a budget being approached, and a check that could not measure its own
 * subject. Both mean "look at this", and the detail says which it was.
 */
const DRIFT_SEVERITY: Record<DriftState, string> = {
  fail: "urgent",
  warn: "warn",
  ok: "info",
};

function DriftRow({ check }: { check: DriftCheck }) {
  return (
    <div className={`slot slot-static sev-${DRIFT_SEVERITY[check.state]}`}>
      <span className="slot-label">{check.state}</span>
      <span className="slot-body">
        <span className="slot-title">{check.name}</span>
        <span className="slot-detail">{check.detail}</span>
      </span>
    </div>
  );
}

export default async function AdminPage() {
  const diag = await runDiagnostics();
  const live = countByStatus(diag.liveness);
  const missingEnv = diag.hubEnv.filter((e) => !e.set);
  const declaredFor = (slug: string) => DECLARED.apps.find((a) => a.slug === slug);

  // Worst first, and the passing ones are listed by name below rather than
  // dropped — a panel showing only problems reads as the whole set of checks.
  const notable = DRIFT.checks.filter((c) => c.state !== "ok");
  notable.sort((a, b) => (a.state === b.state ? 0 : a.state === "fail" ? -1 : 1));
  const passing = DRIFT.checks.filter((c) => c.state === "ok");

  return (
    <div className="admin">
      <header>
        <p className="eyebrow">Admin</p>
        <h1>Platform</h1>
      </header>

      <p className="description">
        What the repo declares, against what the platform reports right now. Nothing here is
        remembered or hand-typed — anything that cannot be reached says so rather than guessing.
      </p>

      <div className="stat-strip">
        <div className="stat">
          <span className="slot-label">Reachable</span>
          <span className="stat-value">
            {live.up} of {diag.liveness.length}
          </span>
          <span className="stat-sub">{live.down} down · {live.unknown} unknown</span>
        </div>
        <div className="stat">
          <span className="slot-label">Hub config</span>
          <span className="stat-value">
            {diag.hubEnv.length - missingEnv.length} of {diag.hubEnv.length}
          </span>
          <span className="stat-sub">
            {missingEnv.length === 0 ? "all set" : `${missingEnv.map((e) => e.name).join(", ")} missing`}
          </span>
        </div>
        <div className="stat">
          <span className="slot-label">Migrations</span>
          <span className="stat-value">{DECLARED.migrationCount ?? "—"}</span>
          <span className="stat-sub">committed in supabase/</span>
        </div>
      </div>

      <p className="admin-note">
        Hub config is what <em>this deployment</em> was built with. Vercel bakes the environment into
        the function at deploy time, so a variable changed in the dashboard since the last deploy
        will still read as it was — a redeploy is what makes a change real, not saving the setting.
      </p>

      <h2 className="admin-section">
        Live connections <span className="admin-qualifier">public /login on each project</span>
      </h2>
      <p className="admin-note">
        Proves DNS, TLS, Vercel routing and that the app booted. It proves nothing about a tool&apos;s
        database or keys — that needs its own health endpoint, which most do not have yet.
      </p>
      <div className="slots">
        {diag.liveness.map((p) => (
          <ProbeRow key={p.target} probe={p} />
        ))}
      </div>

      {diag.internal.length > 0 && (
        <>
          <h2 className="admin-section">
            Shared secrets <span className="admin-qualifier">hub ↔ tool</span>
          </h2>
          <p className="admin-note">
            A mismatched <code>INTERNAL_API_SECRET</code> fails silently, so it is asserted here
            rather than assumed. Only the tracker exposes an endpoint the hub may call.
          </p>
          <div className="slots">
            {diag.internal.map((p) => (
              <ProbeRow key={p.target} probe={p} />
            ))}
          </div>
        </>
      )}

      <h2 className="admin-section">
        Declared <span className="admin-qualifier">generated from the repo</span>
      </h2>
      {DECLARED.complete ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>App</th>
                <th>Vercel project</th>
                <th>Env vars</th>
                <th>Health</th>
                <th>Summary</th>
                <th>Tests</th>
                <th>In CI</th>
              </tr>
            </thead>
            <tbody>
              {PROJECTS.map((project) => {
                const d = declaredFor(project.slug);
                const inCi = DECLARED.ciMatrix.includes(project.slug);
                return (
                  <tr key={project.slug}>
                    <td>{project.slug}</td>
                    <td>
                      <code>{project.vercelProject}</code>
                    </td>
                    <td>{d ? d.envNames.length : "—"}</td>
                    <td className={d?.hasHealthRoute ? "" : "admin-absent"}>
                      {d?.hasHealthRoute ? "yes" : "no"}
                    </td>
                    <td className={d?.hasSummaryRoute ? "" : "admin-absent"}>
                      {d?.hasSummaryRoute ? "yes" : "no"}
                    </td>
                    <td className={d?.hasTestScript ? "" : "admin-absent"}>
                      {d?.hasTestScript ? "yes" : "no"}
                    </td>
                    <td className={inCi ? "" : "admin-absent"}>{inCi ? "yes" : "NO"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="admin-note">
          The declared manifest could not be generated from this checkout, so nothing is shown here
          rather than an empty table that would read as fact.
        </p>
      )}

      <h2 className="admin-section">
        Rules drift <span className="admin-qualifier">measured from the repo at build time</span>
      </h2>
      <p className="admin-note">
        Every rule in <code>CLAUDE.md</code> that can be measured, measured — checksums, the
        deliberate <code>middleware.ts</code> variants, the file budgets, whether each handoff has
        been updated since its own area last changed. <code>scripts/drift-check.mjs</code> answers each one by
        looking rather than by reading a document that claims to know, and{" "}
        <strong>never reports a pass for something it could not look at</strong>: a check that cannot
        measure its own subject warns and says so.
      </p>
      <p className="admin-note">
        <strong>This is the one thing on this page that is neither committed nor live.</strong> It is
        the repo as it stood when this deployment was built, so after a merge that changes a rule it
        is stale until <code>tp-home</code> next deploys. The timestamp at the foot of the page is
        what says how old it is. CI runs the same check on every push, and that is what fails a
        pull request.
      </p>

      {DRIFT.complete ? (
        <>
          <div className="stat-strip">
            <div className="stat">
              <span className="slot-label">Holding</span>
              <span className="stat-value">{DRIFT.counts.ok}</span>
              <span className="stat-sub">measured, and matching the rule</span>
            </div>
            <div className="stat">
              <span className="slot-label">Drifting</span>
              <span className="stat-value">{DRIFT.counts.warn}</span>
              <span className="stat-sub">near a budget, going stale, or not measurable here</span>
            </div>
            <div className="stat">
              <span className="slot-label">False</span>
              <span className="stat-value">{DRIFT.counts.fail}</span>
              <span className="stat-sub">
                {DRIFT.counts.fail === 0
                  ? "no rule is currently untrue"
                  : "a rule in CLAUDE.md is no longer true"}
              </span>
            </div>
          </div>

          {notable.length > 0 && (
            <div className="slots">
              {notable.map((check) => (
                <DriftRow key={check.name} check={check} />
              ))}
            </div>
          )}

          {passing.length > 0 && (
            <p className="slot-note">
              Also measured and holding: {passing.map((c) => c.name).join(" · ")}.
            </p>
          )}
        </>
      ) : (
        <p className="admin-note">{DRIFT.reason}</p>
      )}

      <h2 className="admin-section">
        Blind spots <span className="admin-qualifier">what this page cannot see</span>
      </h2>
      <div className="slots">
        <div className="slot slot-static sev-warn">
          <span className="slot-label">unknown</span>
          <span className="slot-body">
            <span className="slot-title">Whether each tool&apos;s database and keys are healthy</span>
            <span className="slot-detail">
              Only <code>resume</code> and <code>coffee</code> have a <code>/api/health</code> route,
              and both sit behind the password gate with no internal-secret carve-out, so the hub
              gets 401. Fixing it needs a middleware carve-out per app, which is shared auth
              plumbing and not this app&apos;s to change.
            </span>
          </span>
        </div>
        <div className="slot slot-static sev-warn">
          <span className="slot-label">unknown</span>
          <span className="slot-body">
            <span className="slot-title">Which commit each project is serving</span>
            <span className="slot-detail">
              Vercel exposes the deployed SHA to the app itself, not to a sibling. A one-line public
              endpoint per project would make deploy drift visible here — the thing that went
              unnoticed for hours when the GitHub App lost its installation.
            </span>
          </span>
        </div>
        <div className="slot slot-static sev-info">
          <span className="slot-label">by design</span>
          <span className="slot-body">
            <span className="slot-title">Whether SESSION_SECRET matches across the five projects</span>
            <span className="slot-detail">
              Nothing may echo it, so no page can ever check it. The only safe signal is
              behavioural: log in here, then open a tool and see whether it asks again.
            </span>
          </span>
        </div>
      </div>

      <p className="admin-foot">
        Probed {new Date(diag.checkedAt).toUTCString()} · declared manifest generated{" "}
        {new Date(DECLARED.generatedAt).toUTCString()} · drift measured{" "}
        {new Date(DRIFT.generatedAt).toUTCString()}
      </p>
    </div>
  );
}
