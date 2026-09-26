/**
 * The Pit Wall's data: every open issue in Linear, team TEC.
 *
 * Server-side only, through one read-only key (`LINEAR_API_KEY`). What leaves
 * this module is the narrow `PitIssue` below: no issue body, and **no user
 * record** — the query asks for an assignee's id and nothing else, because
 * Linear's user records carry a real name and an email (`CLAUDE.md`). Joel is
 * the only assignee here by rule, so "has an assignee" is all "waiting on you"
 * needs.
 *
 * **It says why it has no answer.** A key never set, a key refused, Linear
 * down and a reply this page cannot read are four different fixes, so each is a
 * sentence rather than an empty board. An empty board and a broken one must
 * never look alike.
 */

export type PitIssue = {
  /** `TEC-84`. */
  id: string;
  title: string;
  url: string;
  /** The workflow state's name, as Linear shows it: `In Progress`, `Todo`. */
  status: string;
  column: Column;
  /** Linear's scale: 1 urgent … 4 low, 0 none. */
  priority: number;
  priorityLabel: string;
  /** The `agent:` label, without its prefix. */
  agent: string | null;
  /** The `owner:` label, without its prefix. */
  owner: string | null;
  parked: boolean;
  /** Assigned, which here only ever means assigned to Joel. */
  waitingOnJoel: boolean;
  /** The first Next step not yet done. Null when there is none to show. */
  next: NextStep | null;
  updatedAt: string;
};

export type NextStep = { actor: string | null; text: string; star: boolean };

/** Where an issue sits on the board. `later` is Backlog, Triage and anything parked. */
export type Column = "progress" | "review" | "todo" | "later";

export type PitWallData =
  | { ok: true; issues: PitIssue[]; readAt: string }
  | { ok: false; why: string; readAt: string };

const ENDPOINT = "https://api.linear.app/graphql";
const TEAM = "TEC";
const TIMEOUT_MS = 4000;
const PAGE = 100;
/** A ceiling, not an expectation: five pages is 500 open issues. */
const MAX_PAGES = 5;

const QUERY = `
  query PitWall($after: String) {
    issues(
      first: ${PAGE}
      after: $after
      filter: { team: { key: { eq: "${TEAM}" } }, state: { type: { nin: ["completed", "canceled", "duplicate"] } } }
    ) {
      nodes {
        identifier
        title
        url
        priority
        priorityLabel
        updatedAt
        description
        state { name type }
        labels { nodes { name } }
        assignee { id }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export type LinearNode = {
  identifier: string;
  title: string;
  url: string;
  priority: number;
  priorityLabel: string;
  updatedAt: string;
  description: string | null;
  state: { name: string; type: string } | null;
  labels: { nodes: { name: string }[] } | null;
  assignee: { id: string } | null;
};

/** Markdown down to the words a card shows: no emphasis, links, tags or code ticks. */
function plain(md: string): string {
  return md
    .replace(/https:\/\/linear\.app\/[\w-]+\/issue\/([A-Z]+-\d+)\S*/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|`)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The first step of an issue's `## Next steps` not yet done. Pure, so it is
 * tested directly.
 *
 * Steps are numbered and open with their actor in bold — `1. **TD:** …` — by
 * the rule the Linear hook enforces, with Joel's ⭐ before or after it. The
 * way a step is marked finished has varied, so each of these counts as done:
 * "done", "skipped" or ✅ inside the bold lead (`**Done, 2026-09-25, Joel:**`),
 * or the text after it opening with "done", "skipped", ✅ or a strikethrough.
 */
export function nextStep(description: string | null): NextStep | null {
  if (!description) return null;
  const heading = description.search(/^#{1,6}\s*next steps\b.*$/im);
  if (heading === -1) return null;
  const section = description.slice(heading).split("\n").slice(1);

  const steps: string[] = [];
  for (const line of section) {
    if (/^#{1,6}\s/.test(line)) break;
    const m = line.match(/^\s{0,3}\d+[.)]\s+(.*)$/);
    if (m) steps.push(m[1]);
    else if (steps.length && /^\s{2,}\S/.test(line) && !/^\s*[*-]\s/.test(line)) steps[steps.length - 1] += ` ${line.trim()}`;
  }

  const DONE = /\b(done|skipped)\b|✅/i;
  for (const step of steps) {
    const star = step.includes("⭐");
    const raw = step.replace(/⭐\uFE0F?/g, "").trim();
    const lead = raw.match(/^\*\*([^*]+?)\*\*:?\s*(.*)$/);
    const actor = lead ? lead[1].trim().replace(/:$/, "").trim() : null;
    const rest = lead ? lead[2] : raw;
    if (actor && DONE.test(actor)) continue;
    if (/^\s*~~/.test(rest) || /^(done|skipped)\b|^✅/i.test(plain(rest))) continue;
    const text = plain(rest);
    if (!text) continue;
    return { actor: actor ? plain(actor) : null, text, star };
  }
  return null;
}

/** Which board column a state belongs in. */
export function columnOf(state: { name: string; type: string } | null, parked: boolean): Column {
  if (parked || !state) return "later";
  if (state.type === "started") return /review/i.test(state.name) ? "review" : "progress";
  if (state.type === "unstarted") return "todo";
  return "later";
}

const labelValue = (labels: string[], prefix: string) =>
  labels.find((l) => l.toLowerCase().startsWith(prefix))?.slice(prefix.length).trim() || null;

/** One Linear node, narrowed to what the board shows. Pure, so it is tested directly. */
export function toIssue(n: LinearNode): PitIssue {
  const labels = (n.labels?.nodes ?? []).map((l) => l.name);
  const parked = labels.some((l) => l.toLowerCase() === "parked");
  return {
    id: n.identifier,
    title: n.title,
    url: n.url,
    status: n.state?.name ?? "Unknown",
    column: columnOf(n.state, parked),
    priority: typeof n.priority === "number" ? n.priority : 0,
    priorityLabel: n.priorityLabel || "No priority",
    agent: labelValue(labels, "agent:"),
    owner: labelValue(labels, "owner:"),
    parked,
    waitingOnJoel: n.assignee !== null && n.assignee !== undefined,
    next: nextStep(n.description),
    updatedAt: n.updatedAt,
  };
}

/** A failed request, as a sentence. */
function explain(error: unknown): string {
  if (!(error instanceof Error)) return "the request failed without saying why";
  if (error.name === "TimeoutError" || error.name === "AbortError") return `Linear did not answer within ${TIMEOUT_MS / 1000} seconds`;
  const cause = (error as { cause?: unknown }).cause;
  const code = cause instanceof Error ? (cause as { code?: string }).code : undefined;
  return code ? `Linear could not be reached (${code})` : `Linear could not be reached (${error.message})`;
}

export async function loadPitWall(key: string | undefined = process.env.LINEAR_API_KEY): Promise<PitWallData> {
  const readAt = new Date().toISOString();
  if (!key) return { ok: false, why: "LINEAR_API_KEY is not set on home, so Linear was not asked", readAt };

  const issues: PitIssue[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        // A personal API key goes in the header as-is; only OAuth tokens take "Bearer".
        headers: { Authorization: key, "Content-Type": "application/json" },
        body: JSON.stringify({ query: QUERY, variables: { after } }),
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      return { ok: false, why: explain(error), readAt };
    }

    if (res.status === 401 || res.status === 403) {
      return { ok: false, why: `Linear refused the key (${res.status}) — it may be revoked, or lack read access to team ${TEAM}`, readAt };
    }
    if (!res.ok) return { ok: false, why: `Linear answered ${res.status}`, readAt };

    let body: { data?: { issues?: { nodes?: LinearNode[]; pageInfo?: { hasNextPage: boolean; endCursor: string | null } } }; errors?: { message: string }[] };
    try {
      body = await res.json();
    } catch {
      return { ok: false, why: "Linear's reply was not JSON", readAt };
    }
    if (body.errors?.length) return { ok: false, why: `Linear refused the query — ${body.errors[0].message}`, readAt };
    const conn = body.data?.issues;
    if (!conn || !Array.isArray(conn.nodes)) return { ok: false, why: "Linear's reply had no issues in it — its shape has changed", readAt };

    issues.push(...conn.nodes.map(toIssue));
    if (!conn.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }

  return { ok: true, issues, readAt };
}
