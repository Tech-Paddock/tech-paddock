import { PROBED, type Project } from "./platform";
import type { Probe } from "./diagnostics";

/**
 * Failed production deploys, for The Garage. Errors only: a project whose
 * latest production deployment is live, or on its way, is not mentioned.
 *
 * Read from GitHub, through `GITHUB_TOKEN`: Vercel posts a GitHub deployment,
 * and statuses on it, for every build it runs from a push, under the
 * environment `Production – <project>`. Reading those replaced a Vercel team
 * token — full power, held for one read.
 *
 * **Only the latest counts.** A failure followed by a good deploy is fixed and
 * leaves the page; a failure stays until something newer succeeds.
 *
 * **A parked project is left out.** Joel pauses its Vercel project, so it
 * deploys red on `main` itself (`CLAUDE.md`). That is expected, and The
 * Garage's live connections already show it grey.
 *
 * **Blind spot:** a rollback or redeploy started from the Vercel dashboard
 * posts no GitHub deployment, so it does not show here.
 */

const TIMEOUT_MS = 4000;
const API = "https://api.github.com/repos/Tech-Paddock/tech-paddock";

export type LatestDeploy = {
  project: Project & { parked?: true };
  /** Null when GitHub has no production deployment for this project at all. */
  deployment: { sha: string; createdAt: string } | null;
  status: { state: string; description: string | null; at: string } | null;
};

async function json(url: string, token: string) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

const short = (sha: string) => sha.slice(0, 7);

/**
 * One project's latest production deployment, as a Garage row — or null when
 * there is nothing wrong to say. Pure, so it is tested directly.
 */
export function deployError(d: LatestDeploy): Probe | null {
  const target = d.project.name;
  if (d.project.parked) return null;
  if (!d.deployment) {
    return { target, status: "unknown", detail: "GitHub has no production deployment for it", raw: d.project.vercelProject, ms: null };
  }
  if (!d.status) {
    return { target, status: "unknown", detail: "its latest production deployment has no status yet", raw: short(d.deployment.sha), ms: null };
  }
  const raw = `${short(d.deployment.sha)} · ${d.status.state}${d.status.description ? ` · Vercel: "${d.status.description}"` : ""}`;
  switch (d.status.state) {
    case "success":
    case "pending":
    case "queued":
    case "in_progress":
      return null;
    case "failure":
    case "error":
      return { target, status: "down", detail: "its latest production deployment failed — the previous one is still serving", raw, ms: null };
    default:
      return { target, status: "unknown", detail: `its latest production deployment reads "${d.status.state}", which this page does not interpret`, raw, ms: null };
  }
}

async function latestDeploy(project: Project & { parked?: true }, token: string): Promise<LatestDeploy> {
  const env = encodeURIComponent(`Production – ${project.vercelProject}`);
  const list = (await json(`${API}/deployments?environment=${env}&per_page=1`, token)) as {
    id: number;
    sha: string;
    created_at: string;
  }[];
  const latest = list[0];
  if (!latest) return { project, deployment: null, status: null };
  const statuses = (await json(`${API}/deployments/${latest.id}/statuses?per_page=1`, token)) as {
    state: string;
    description: string | null;
    created_at: string;
  }[];
  const s = statuses[0];
  return {
    project,
    deployment: { sha: latest.sha, createdAt: latest.created_at },
    status: s ? { state: s.state, description: s.description, at: s.created_at } : null,
  };
}

/** Why GitHub gave no answer, as a sentence. Exported for the tests. */
export function whyGitHub(message: string): string {
  if (message.includes("401")) return "could not check — GitHub refused GITHUB_TOKEN; it may be expired or revoked";
  if (message.includes("403")) return "could not check — GitHub refused GITHUB_TOKEN; it may lack Deployments: read";
  if (/timeout|aborted/i.test(message)) return "could not check — GitHub did not answer in time";
  return "could not check — GitHub did not answer";
}

/** Every probed project's deploy problem, if it has one. Empty is the healthy state. */
export async function deployErrors(token: string | undefined = process.env.GITHUB_TOKEN): Promise<Probe[]> {
  if (!token) {
    return [{ target: "Deploys", status: "unknown", detail: "could not check — GITHUB_TOKEN is not set on home", raw: null, ms: null }];
  }
  const live = PROBED.filter((p) => !p.parked);
  const settled = await Promise.allSettled(live.map((p) => latestDeploy(p, token)));

  const failed = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed.length === live.length) {
    const msg = (failed[0]?.reason as Error)?.message ?? "failed";
    return [{ target: "Deploys", status: "unknown", detail: whyGitHub(msg), raw: msg, ms: null }];
  }

  return settled.flatMap((r, i) => {
    if (r.status === "rejected") {
      const msg = (r.reason as Error)?.message ?? "failed";
      return [{ target: live[i].name, status: "unknown" as const, detail: whyGitHub(msg), raw: msg, ms: null }];
    }
    const row = deployError(r.value);
    return row ? [row] : [];
  });
}
