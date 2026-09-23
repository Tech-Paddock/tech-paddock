import { PADDOCK } from "./paddock.generated";

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
 * Every row carries its `source`. That is not decoration: it is what lets a
 * reader tell whether "the migration is applied" came from the database or from
 * a document that merely says so.
 */

export type PitState = "box" | "agent" | "clear";
export type PitSource = "github" | "vercel" | "repo" | "worklog" | "supabase";

export type PitItem = {
  state: PitState;
  source: PitSource;
  agent: string | null;
  title: string;
  detail: string;
  ref: string;
};

export type PitAgent = {
  id: string;
  name: string;
  /** Null until telemetry exists. Rendered as an em dash, never as a guess. */
  lastSeen: string | null;
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

async function json(url: string, token: string, extra: Record<string, string> = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...extra },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const REPO = "Tech-Paddock/tech-paddock";

/**
 * Open pull requests, and branches ahead of `main` that have none.
 *
 * The second is the "needs pushing" list Joel asked for, and it is the reason
 * this reads branches rather than only pull requests: a finished branch with no
 * pull request is invisible everywhere else, and under this project's rules that
 * is the *normal* end state of an agent's work rather than an anomaly.
 */
async function github(): Promise<{ items: PitItem[] } | { why: string }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { why: "GITHUB_TOKEN is not set on this deployment" };
  try {
    const [prs, branches] = await Promise.all([
      json(`https://api.github.com/repos/${REPO}/pulls?state=open&per_page=20`, token),
      json(`https://api.github.com/repos/${REPO}/branches?per_page=50`, token),
    ]);
    const items: PitItem[] = [];
    for (const pr of prs as { number: number; title: string; head: { ref: string } }[]) {
      items.push({
        state: "box",
        source: "github",
        agent: null,
        title: `#${pr.number} is open and waiting on you`,
        detail: pr.title,
        ref: pr.head.ref,
      });
    }
    const open = new Set((prs as { head: { ref: string } }[]).map((p) => p.head.ref));
    for (const b of branches as { name: string }[]) {
      if (b.name === "main" || open.has(b.name)) continue;
      items.push({
        state: "agent",
        source: "github",
        agent: null,
        title: `${b.name} has no pull request`,
        detail: "A finished branch is the deliverable here, so this may simply be waiting to be asked for.",
        ref: b.name,
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
    return { items };
  } catch (e) {
    return { why: `GitHub did not answer (${(e as Error).message})` };
  }
}

/** Failed deployments only. Runtime errors have no store and are out of scope. */
async function vercel(): Promise<{ items: PitItem[] } | { why: string }> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return { why: "VERCEL_TOKEN is not set on this deployment" };
  try {
    const data = await json("https://api.vercel.com/v6/deployments?limit=40&teamId=tech-paddock", token);
    const bad = (data.deployments ?? []).filter((d: { state: string }) => d.state === "ERROR");
    if (bad.length === 0) {
      return {
        items: [{
          state: "clear",
          source: "vercel",
          agent: null,
          title: "No failed deployments",
          detail: "Across the last 40 deployments on the team.",
          ref: "—",
        }],
      };
    }
    return {
      items: bad.slice(0, 5).map((d: { name: string; url: string }) => ({
        state: "box" as const,
        source: "vercel" as const,
        agent: null,
        title: `${d.name} failed to deploy`,
        detail: d.url,
        ref: d.name,
      })),
    };
  } catch (e) {
    return { why: `Vercel did not answer (${(e as Error).message})` };
  }
}

export async function loadPitWall(): Promise<PitWall> {
  const unavailable: { source: PitSource; why: string }[] = [];
  const items: PitItem[] = [];

  const [gh, vc] = await Promise.all([github(), vercel()]);
  if ("items" in gh) items.push(...gh.items); else unavailable.push({ source: "github", why: gh.why });
  if ("items" in vc) items.push(...vc.items); else unavailable.push({ source: "vercel", why: vc.why });

  // Telemetry does not exist yet. Say so rather than leaving a silent gap.
  unavailable.push({ source: "supabase", why: "Agent telemetry is not built yet — nothing reports what it is doing mid-session" });

  items.sort((a, b) => ORDER[a.state] - ORDER[b.state]);

  return {
    items,
    agents: PADDOCK.agents.map((a) => ({ ...a, lastSeen: null })),
    unavailable,
    bakedAt: PADDOCK.bakedAt,
    readAt: new Date().toISOString(),
  };
}
