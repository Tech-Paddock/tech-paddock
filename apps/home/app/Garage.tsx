import type { ReactNode } from "react";
import { DECLARED } from "@/lib/declared.generated";
import { DRIFT } from "@/lib/drift.generated";
import type { DriftCheck, DriftState } from "@/lib/platform";
import { runDiagnostics, type Probe, type Status } from "@/lib/diagnostics";
import { budgetDistance, explainDrift } from "@/lib/drift-explain";

/**
 * The Garage: what is wrong right now. Home's second tab, beside the Pit Wall;
 * `/admin` redirects here.
 *
 * One row per thing, each with a stoplight — green answering, amber could not
 * be tested, red broken, grey parked on purpose. No pills and no tallies: a
 * count above a list repeats the list, and a pill is a second word for the
 * colour the light already shows.
 *
 * **A failure says what failed.** Every red or amber row carries the sentence
 * `lib/diagnostics.ts` wrote for it, with the raw code after it.
 *
 * **Environment and deploy errors appear only when there is one.** Nothing is
 * listed while every variable and every deploy is as it should be.
 *
 * An async server component, rendered by `(shell)/page.tsx` inside its own
 * Suspense boundary. It reports no environment value, only whether a name is
 * set.
 */

type Light = "go" | "caution" | "stop" | "off";

const PROBE_LIGHT: Record<Status, Light> = { up: "go", unknown: "caution", down: "stop", parked: "off" };
const DRIFT_LIGHT: Record<DriftState, Light> = { ok: "go", warn: "caution", fail: "stop" };
const LIGHT_SAYS: Record<Light, string> = { go: "working", caution: "needs a look", stop: "broken", off: "parked" };

function Row({
  light,
  title,
  detail,
  raw,
  aside,
}: {
  light: Light;
  title: ReactNode;
  detail?: ReactNode;
  raw?: string | null;
  aside?: string;
}) {
  return (
    <li className="gr">
      <span className={`light light-${light}`} role="img" aria-label={LIGHT_SAYS[light]} />
      <span className="gr-body">
        <span className="gr-title">{title}</span>
        {detail && <span className="gr-detail">{detail}</span>}
        {raw && <span className="gr-raw">{raw}</span>}
      </span>
      {aside && <span className="gr-aside">{aside}</span>}
    </li>
  );
}

function ProbeRow({ probe }: { probe: Probe }) {
  return (
    <Row
      light={PROBE_LIGHT[probe.status]}
      title={probe.target}
      detail={probe.detail}
      raw={probe.raw}
      aside={probe.ms === null ? undefined : `${probe.ms} ms`}
    />
  );
}

/** The explanation is said once for its group, above the rows, not on each. */
function DriftRow({ check }: { check: DriftCheck }) {
  return <Row light={DRIFT_LIGHT[check.state]} title={check.name} raw={budgetDistance(check) ?? (check.detail || null)} />;
}

/**
 * Checks sharing an explanation, in first-seen order — seven budgets say what a
 * budget is once rather than seven times. A check with no explanation stands in
 * a group of its own.
 */
function byExplanation(checks: DriftCheck[]) {
  const groups: { why: string | null; checks: DriftCheck[] }[] = [];
  for (const check of checks) {
    const why = explainDrift(check);
    const group = why === null ? undefined : groups.find((g) => g.why === why);
    if (group) group.checks.push(check);
    else groups.push({ why, checks: [check] });
  }
  return groups;
}

export default async function Garage() {
  const diag = await runDiagnostics();
  const withHealth = DECLARED.apps.filter((a) => a.hasHealthRoute).map((a) => a.slug);

  // Broken first, then drifting. Holding checks fold away below them.
  const drifting = DRIFT.checks
    .filter((c) => c.state !== "ok")
    .sort((a, b) => (a.state === b.state ? 0 : a.state === "fail" ? -1 : 1));
  const holding = DRIFT.checks.filter((c) => c.state === "ok");

  return (
    <div className="admin">
      <p className="legend-row">
        <span className="legend"><span className="light light-go" aria-hidden="true" /> working</span>
        <span className="legend"><span className="light light-caution" aria-hidden="true" /> could not be tested</span>
        <span className="legend"><span className="light light-stop" aria-hidden="true" /> broken</span>
        <span className="legend"><span className="light light-off" aria-hidden="true" /> parked on purpose</span>
      </p>

      {diag.envErrors.length > 0 && (
        <>
          <h2 className="admin-section">
            Environment errors <span className="admin-qualifier">home&apos;s own variables</span>
          </h2>
          <p className="admin-note">
            As this deployment was built. A fix made in the Vercel dashboard clears here only once home
            redeploys.
          </p>
          <ul className="garage-rows">
            {diag.envErrors.map((e) => (
              <Row
                key={e.name}
                light="stop"
                title={
                  <>
                    {e.affects} <code>{e.name}</code>
                  </>
                }
                detail={e.problem}
              />
            ))}
          </ul>
        </>
      )}

      <h2 className="admin-section">
        Live connections <span className="admin-qualifier">each app&apos;s public /login</span>
      </h2>
      <p className="admin-note">
        Proves the app is reachable and booted — not that its database or keys work.
      </p>
      <ul className="garage-rows">
        {diag.liveness.map((p) => (
          <ProbeRow key={p.target} probe={p} />
        ))}
      </ul>

      {diag.deploys.length > 0 && (
        <>
          <h2 className="admin-section">
            Deploy errors <span className="admin-qualifier">latest production deploy, from GitHub</span>
          </h2>
          <ul className="garage-rows">
            {diag.deploys.map((p) => (
              <ProbeRow key={p.target} probe={p} />
            ))}
          </ul>
        </>
      )}

      <h2 className="admin-section">
        Rules drift <span className="admin-qualifier">the repo when home was last built</span>
      </h2>
      <p className="admin-note">
        Every rule in <code>CLAUDE.md</code> that can be measured, measured by{" "}
        <code>scripts/drift-check.mjs</code>. It can be one merge behind; CI runs the same check on
        every push.
      </p>

      {DRIFT.complete ? (
        <>
          {drifting.length > 0 ? (
            byExplanation(drifting).map((group) => (
              <div key={group.checks[0].name} className="garage-group">
                {group.why && <p className="garage-why">{group.why}</p>}
                <ul className="garage-rows">
                  {group.checks.map((check) => (
                    <DriftRow key={check.name} check={check} />
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <p className="admin-note">Nothing is drifting.</p>
          )}

          {holding.length > 0 && (
            <details className="garage-holding">
              <summary>
                {holding.length} {holding.length === 1 ? "check is" : "checks are"} holding
              </summary>
              <ul className="garage-rows">
                {holding.map((check) => (
                  <DriftRow key={check.name} check={check} />
                ))}
              </ul>
            </details>
          )}
        </>
      ) : (
        <ul className="garage-rows">
          <Row light="caution" title="Drift could not be measured" detail={DRIFT.reason} />
        </ul>
      )}

      <h2 className="admin-section">
        Blind spots <span className="admin-qualifier">what this page cannot see</span>
      </h2>
      <ul className="garage-blind">
        <li>
          <strong>Whether each tool&apos;s database and keys are healthy.</strong>{" "}
          {withHealth.length === 0 ? (
            <>No app has a <code>/api/health</code> route.</>
          ) : (
            <>
              {withHealth.join(", ")} {withHealth.length === 1 ? "has" : "have"} a{" "}
              <code>/api/health</code> route, but each sits behind the password gate, so home gets
              401. Opening it up is a middleware change — shared auth plumbing, not this app&apos;s.
            </>
          )}
        </li>
        <li>
          <strong>Which commit each project is serving.</strong> Deploy errors read each project&apos;s
          latest production deployment from GitHub, but a rollback or redeploy started in the Vercel
          dashboard posts nothing there, so what is serving can differ.
        </li>
        <li>
          <strong>Whether SESSION_SECRET matches across every project.</strong> Nothing may echo it,
          so no page can check it. The test is behavioural: sign in here, open a tool, and see
          whether it asks again.
        </li>
      </ul>

      <p className="admin-foot">
        Probed {new Date(diag.checkedAt).toUTCString()} · drift measured{" "}
        {new Date(DRIFT.generatedAt).toUTCString()}
      </p>
    </div>
  );
}
