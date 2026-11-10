import type { Probe } from "./diagnostics";
import { whyGitHub, type Deploys, type LatestDeploy } from "./deploys";
import type { Project } from "./platform";

/**
 * Which commit each app is serving, for The Garage (TEC-57).
 *
 * Every app answers `GET /api/version` with `{ commit }`, signed out: the
 * stamped route, opened by the gate for that exact path and method. This reads
 * it and sets it beside the commit of the project's latest production
 * deployment (`lib/deploys.ts`), which is where a rollback or a dashboard
 * redeploy shows up: the two stop agreeing. Home holds no database credential
 * and none is needed; a commit is the only thing read from a tool.
 */

const TIMEOUT_MS = 4000;

/** What asking an app which commit it serves came to. */
export type Serving =
  | { ok: true; commit: string | null }
  | { ok: false; detail: string; raw: string | null };

const short = (sha: string) => sha.slice(0, 7);

/** The commit out of an app's answer, or null when the answer is not the shape the route sends. Exported for the tests. */
export function parseVersion(body: unknown): Serving {
  if (typeof body !== "object" || body === null || !("commit" in body)) {
    return { ok: false, detail: "it answered, but not with a commit field", raw: null };
  }
  const c = (body as { commit: unknown }).commit;
  if (c === null) return { ok: true, commit: null };
  if (typeof c === "string" && /^[0-9a-f]{7,64}$/i.test(c)) return { ok: true, commit: c.toLowerCase() };
  return { ok: false, detail: "it answered with a commit that is not a git hash", raw: null };
}

/** One app's serving commit, asked over the public internet. Never throws. */
export async function servingCommit(
  project: Project,
  explain: (e: unknown) => { detail: string; raw: string | null },
  explainStatus: (status: number, vercelError: string | null) => { detail: string; raw: string }
): Promise<Serving> {
  try {
    const res = await fetch(`${project.url}/api/version`, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, ...explainStatus(res.status, res.headers.get("x-vercel-error")) };
    return parseVersion(await res.json().catch(() => null));
  } catch (error) {
    return { ok: false, ...explain(error) };
  }
}

/** What GitHub said about the project's latest production deployment. */
export type Latest = { ok: true; deploy: LatestDeploy } | { ok: false; detail: string };

/**
 * One app's row: the commit it serves against the latest production
 * deployment's. Pure, so it is tested directly. Green only when the two are the
 * same commit; a mismatch is red when the latest deployment succeeded (the app
 * is serving something else: a rollback, or an older redeploy), amber when that
 * deployment has not finished or failed (a newer deploy is on its way, or
 * never arrived).
 */
export function versionRow(target: string, serving: Serving, latest: Latest): Probe {
  if (!serving.ok) {
    return { target, status: "down", detail: `could not read which commit it serves — ${serving.detail}`, raw: serving.raw, ms: null };
  }
  if (serving.commit === null) {
    return {
      target,
      status: "unknown",
      detail: "it answered but reports no commit — VERCEL_GIT_COMMIT_SHA is unset, as on a deploy not made from git",
      raw: null,
      ms: null,
    };
  }
  const said = short(serving.commit);
  if (!latest.ok) {
    return { target, status: "unknown", detail: `serving ${said}; ${latest.detail}`, raw: said, ms: null };
  }
  const d = latest.deploy;
  if (!d.deployment) {
    return { target, status: "unknown", detail: `serving ${said}; GitHub has no production deployment to compare it with`, raw: said, ms: null };
  }
  const want = short(d.deployment.sha);
  const state = d.status?.state ?? "no status yet";
  if (d.deployment.sha.toLowerCase() === serving.commit) {
    return { target, status: "up", detail: `serving ${said}, its latest production deployment`, raw: null, ms: null };
  }
  const raw = `serving ${said} · latest deployment ${want} · ${state}`;
  if (state === "success") {
    return {
      target,
      status: "down",
      detail: `serving ${said}, not ${want}, its latest production deployment — a rollback or a redeploy of an older commit`,
      raw,
      ms: null,
    };
  }
  return {
    target,
    status: "unknown",
    detail: `serving ${said}; its latest production deployment ${want} is not live (${state})`,
    raw,
    ms: null,
  };
}

/** Every live project's row. Home reads its own commit rather than fetching itself. */
export function versionRows(
  projects: (Project & { parked?: true })[],
  servings: Map<string, Serving>,
  deploys: Deploys
): Probe[] {
  return projects
    .filter((p) => !p.parked)
    .map((p) => {
      const serving = servings.get(p.slug) ?? { ok: false as const, detail: "it was not asked", raw: null };
      let latest: Latest;
      if (deploys.kind === "unchecked") {
        latest = { ok: false, detail: deploys.probe.detail };
      } else {
        const i = deploys.live.findIndex((l) => l.slug === p.slug);
        const r = i === -1 ? undefined : deploys.settled[i];
        if (!r) latest = { ok: false, detail: "GitHub was not asked about it" };
        else if (r.status === "rejected") latest = { ok: false, detail: whyGitHub((r.reason as Error)?.message ?? "failed") };
        else latest = { ok: true, deploy: r.value };
      }
      return versionRow(p.name, serving, latest);
    });
}
