import { PADDOCK } from "./paddock.generated";
import { PROBED, type Project } from "./platform";

/**
 * The pit wall's data layer.
 *
 * One job: "what needs me, right now, with several agents out." Everything here
 * resolves toward that sentence, which is why rows are ordered by *who is
 * blocked* rather than by where they came from or how new they are.
 *
 * It follows `glance.ts` rather than inventing a second pattern: ask each source
 * for its own answer, merge, and **name the ones that did not answer instead of
 * guessing**. A source that cannot be reached appears in `unavailable` with a
 * reason, and never as zero — an empty board and a broken board must never look
 * alike.
 *
 * **Everything live here comes from GitHub, through one read-only token.**
 * Deployment state included: Vercel posts a GitHub deployment, and statuses on
 * it, for every build it runs from a push, under the environment
 * `Production – <project>`. Reading those replaced a Vercel team token — full
 * power, held for one read — and a scan of the team's last 40 deployments that
 * let a failure scroll out after a handful of merges and kept a fixed one on the
 * board until it did.
 */

export type PitState = "box" | "agent" | "clear";
export type PitSource = "github" | "deployments";

export type PitItem = {
  state: PitState;
  source: PitSource;
  /** The agent whose area this is, from the branch or project name. Null when it names no area. */
  agent: string | null;
  title: string;
  detail: string;
  ref: string;
};

export type PitAgent = {
  id: string;
  name: string;
  /** The `State as of` line of the agent's handoff, baked at the last deploy. */
  asOf: string | null;
};

export type PitWall = {
  items: PitItem[];
  agents: PitAgent[];
  /** Sources that could not be reached, with why. Rendered, never swallowed. */
  unavailable: { source: PitSource; why: string }[];
  /** When the repo half was baked. It is only as fresh as the last deploy. */
  bakedAt: string;
  /** When this assembly ran. The live half is this fresh. */
  readAt: string;
};

const ORDER: Record<PitState, number> = { box: 0, agent: 1, clear: 2 };
const TIMEOUT_MS = 4000;
const REPO = "Tech-Paddock/tech-paddock";
const API = `https://api.github.com/repos/${REPO}`;

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

/**
 * Which agent a branch or project belongs to.
 *
 * Branches are `claude/<area>-<change>`, and the area is an app's folder name
 * or a layer (`CLAUDE.md`, *Always*). The app folders map to the agents
 * `CLAUDE.md`'s *Who you are* table gives them; a branch whose area is itself an
 * agent's folder (`claude/td-…`) is that agent's. Anything else — `docs`, which
 * any agent writes, or a name that follows no convention — is left unattributed
 * rather than guessed.
 */
const AREA_OWNER: Record<string, string> = {
  home: "techpad-gen",
  tracker: "techpad-gen",
  editor: "td",
  resume: "resume",
  coffee: "coffee",
  health: "health",
  cookbook: "cookbook",
  db: "td",
  platform: "td",
  ci: "deployment",
};

export function ownerOf(area: string, agentIds: Set<string>): string | null {
  const owner = AREA_OWNER[area] ?? (agentIds.has(area) ? area : null);
  return owner && agentIds.has(owner) ? owner : null;
}

export function branchArea(branch: string): string {
  const rest = branch.startsWith("claude/") ? branch.slice("claude/".length) : branch;
  return rest.split(/[-/]/)[0] ?? "";
}

type Pull = { number: number; title: string; head: { ref: string; sha: string }; merged_at?: string | null };
type Branch = { name: string; commit: { sha: string } };

/**
 * Open pull requests, and branches ahead of `main` that have none.
 *
 * The second is the "needs pushing" list Joel asked for: a finished branch with
 * no pull request is invisible everywhere else, and under this project's rules
 * that is the *normal* end state of an agent's work rather than an anomaly.
 *
 * **A merged branch is not one of them.** Merges here are squashed, so a merged
 * branch's commits never reach `main` and the compare endpoint still counts it
 * ahead — `ahead_by` alone cannot see a squash. So a branch whose tip is the
 * head of a merged pull request is merged; `ahead_by` then only has to catch a
 * branch with nothing on it yet.
 */
export function classifyBranches(
  open: Pull[],
  branches: Branch[],
  closed: Pull[],
  aheadBy: Map<string, number | null>,
  agentIds: Set<string>,
): PitItem[] {
  const items: PitItem[] = [];
  for (const pr of open) {
    items.push({
      state: "box",
      source: "github",
      agent: ownerOf(branchArea(pr.head.ref), agentIds),
      title: `#${pr.number} is open and waiting on you`,
      detail: pr.title,
      ref: pr.head.ref,
    });
  }
  const openRefs = new Set(open.map((p) => p.head.ref));
  const mergedTips = new Set(closed.filter((p) => p.merged_at).map((p) => p.head.sha));
  const merged: string[] = [];

  for (const b of branches) {
    if (b.name === "main" || openRefs.has(b.name)) continue;
    if (mergedTips.has(b.commit.sha)) {
      merged.push(b.name);
      continue;
    }
    const ahead = aheadBy.get(b.name);
    if (ahead === 0) continue;
    items.push({
      state: "agent",
      source: "github",
      agent: ownerOf(branchArea(b.name), agentIds),
      title: `${b.name} has no pull request`,
      detail:
        ahead == null
          ? "Could not compare it with main, so it is listed rather than dropped."
          : `${ahead} commit${ahead === 1 ? "" : "s"} ahead of main. A finished branch is the deliverable here, so this may simply be waiting to be asked for.`,
      ref: b.name,
    });
  }

  if (merged.length > 0) {
    items.push({
      state: "clear",
      source: "github",
      agent: null,
      title: `${merged.length} merged branch${merged.length === 1 ? " is" : "es are"} not yet deleted`,
      detail: merged.join(" · "),
      ref: "—",
    });
  }

  if (items.length === 0) {
    items.push({
      state: "clear",
      source: "github",
      agent: null,
      title: "No open pull requests, nothing unpushed",
      detail: `${REPO} — every branch is either main or has a pull request.`,
      ref: "—",
    });
  }
  return items;
}

async function github(token: string, agentIds: Set<string>): Promise<{ items: PitItem[] } | { why: string }> {
  try {
    const [open, branches, closed] = (await Promise.all([
      json(`${API}/pulls?state=open&per_page=30`, token),
      json(`${API}/branches?per_page=100`, token),
      json(`${API}/pulls?state=closed&sort=updated&direction=desc&per_page=100`, token),
    ])) as [Pull[], Branch[], Pull[]];

    const openRefs = new Set(open.map((p) => p.head.ref));
    const mergedTips = new Set(closed.filter((p) => p.merged_at).map((p) => p.head.sha));
    const candidates = branches.filter(
      (b) => b.name !== "main" && !openRefs.has(b.name) && !mergedTips.has(b.commit.sha),
    );
    const aheadBy = new Map<string, number | null>(
      await Promise.all(
        candidates.map(async (b): Promise<[string, number | null]> => {
          try {
            const c = await json(`${API}/compare/main...${encodeURIComponent(b.name).replace(/%2F/g, "/")}`, token);
            return [b.name, typeof c.ahead_by === "number" ? c.ahead_by : null];
          } catch {
            return [b.name, null];
          }
        }),
      ),
    );

    return { items: classifyBranches(open, branches, closed, aheadBy, agentIds) };
  } catch (e) {
    return { why: `GitHub did not answer (${(e as Error).message})` };
  }
}

/** The GitHub deployment status states, as Vercel posts them. */
export type DeployState = "success" | "failure" | "error" | "pending" | "queued" | "in_progress" | "inactive";

export type LatestDeploy = {
  project: Project & { parked?: true };
  /** Null when GitHub has no production deployment for this project at all. */
  deployment: { sha: string; createdAt: string } | null;
  status: { state: string; description: string | null; at: string } | null;
};

const short = (sha: string) => sha.slice(0, 7);

/**
 * One project's latest production deployment, as a row — or as a reason, when
 * the answer cannot be read. Pure, so it is tested directly.
 *
 * **Only the latest counts.** A failure followed by a good deploy is fixed and
 * leaves the board; a failure stays until something newer succeeds, however
 * many merges happen elsewhere in between.
 *
 * **A parked project's failure is expected** (`CLAUDE.md`: Joel pauses its
 * Vercel project, so it deploys red on `main` itself), so it is shown as clear
 * and says why rather than asking for attention nobody should give it.
 */
export function deployRow(
  d: LatestDeploy,
  agentIds: Set<string>,
): { item: PitItem; live: boolean } | { why: string } {
  const name = d.project.vercelProject;
  if (!d.deployment) return { why: `${name}: GitHub has no production deployment for it` };
  if (!d.status) return { why: `${name}: its latest production deployment has no status yet` };

  const agent = ownerOf(d.project.slug, agentIds);
  const at = `${short(d.deployment.sha)} · ${d.status.at}`;
  const said = d.status.description ? ` — Vercel: "${d.status.description}"` : "";

  switch (d.status.state) {
    case "success":
      return {
        live: true,
        item: { state: "clear", source: "deployments", agent, title: `${name} is live`, detail: at, ref: name },
      };
    case "pending":
    case "queued":
    case "in_progress":
      return {
        live: false,
        item: { state: "clear", source: "deployments", agent, title: `${name} is deploying`, detail: `${at}${said}`, ref: name },
      };
    case "failure":
    case "error":
      if (d.project.parked) {
        return {
          live: false,
          item: {
            state: "clear",
            source: "deployments",
            agent,
            title: `${name} is parked — its red deployment is expected`,
            detail: `${at}${said}`,
            ref: name,
          },
        };
      }
      return {
        live: false,
        item: {
          state: "box",
          source: "deployments",
          agent,
          title: `${name}'s latest production deployment failed`,
          detail: `${at}${said}`,
          ref: name,
        },
      };
    default:
      return { why: `${name}: its latest production deployment reads "${d.status.state}", which this page does not interpret` };
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

/**
 * The latest production deployment of every project the hub probes. Rows that
 * are all "live" fold into one, so a healthy platform is one line, not seven.
 */
async function deployments(token: string, agentIds: Set<string>): Promise<{ items: PitItem[]; why: string[] } | { why: string }> {
  const settled = await Promise.allSettled(PROBED.map((p) => latestDeploy(p, token)));
  const items: PitItem[] = [];
  const why: string[] = [];
  const live: string[] = [];

  settled.forEach((r, i) => {
    const name = PROBED[i].vercelProject;
    if (r.status === "rejected") {
      const msg = (r.reason as Error)?.message ?? "failed";
      why.push(`${name}: GitHub did not answer (${msg}${msg.includes("403") ? " — GITHUB_TOKEN may lack Deployments: read" : ""})`);
      return;
    }
    const row = deployRow(r.value, agentIds);
    if ("why" in row) why.push(row.why);
    else if (row.live) live.push(name);
    else items.push(row.item);
  });

  if (why.length === PROBED.length) return { why: why.join("; ") };
  if (live.length > 0) {
    items.push({
      state: "clear",
      source: "deployments",
      agent: null,
      title: `Latest production deployment ready: ${live.join(", ")}`,
      detail: "Read from the deployment statuses Vercel posts to GitHub. A redeploy started from the Vercel dashboard posts none, so it does not show here.",
      ref: "—",
    });
  }
  return { items, why };
}

export async function loadPitWall(): Promise<PitWall> {
  const unavailable: { source: PitSource; why: string }[] = [];
  const items: PitItem[] = [];
  const agentIds = new Set(PADDOCK.agents.map((a) => a.id));

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    unavailable.push({ source: "github", why: "GITHUB_TOKEN is not set on this deployment" });
    unavailable.push({ source: "deployments", why: "GITHUB_TOKEN is not set on this deployment" });
  } else {
    const [gh, dep] = await Promise.all([github(token, agentIds), deployments(token, agentIds)]);
    if ("items" in gh) items.push(...gh.items);
    else unavailable.push({ source: "github", why: gh.why });
    if ("items" in dep) {
      items.push(...dep.items);
      for (const why of dep.why) unavailable.push({ source: "deployments", why });
    } else {
      unavailable.push({ source: "deployments", why: dep.why });
    }
  }

  items.sort((a, b) => ORDER[a.state] - ORDER[b.state]);

  return {
    items,
    agents: PADDOCK.agents,
    unavailable,
    bakedAt: PADDOCK.bakedAt,
    readAt: new Date().toISOString(),
  };
}
