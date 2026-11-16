/**
 * The Pit Wall's data: every open issue in `Tech-Paddock/paddock-issues`.
 *
 * Server-side only, through `GITHUB_TOKEN` (read-only: Issues: read on that
 * repository). This module only ever reads; the Pit Wall never writes to the
 * tracker. What leaves it is the narrow `PitIssue` below: no issue body, and
 * **no user record** — the only thing taken from `assignee` is whether it is
 * there, never who it is, because a user record carries a real name
 * (`CLAUDE.md`). The owner is the only assignee by rule, so an `Owner task`
 * with an assignee is all "waiting on you" needs.
 *
 * **It says why it has no answer.** A token never set, a token GitHub refuses,
 * GitHub down and a reply this page cannot read are different fixes, so each is
 * a sentence rather than an empty board. An empty board and a broken one must
 * never look alike.
 */

export type PitIssue = {
  /** The issue number in paddock-issues; the stable key. */
  number: number;
  /** `TEC-84` for an imported issue, otherwise `#84`. */
  id: string;
  /** The title, without a leading `TEC-n:`. */
  title: string;
  /** The issue's page on GitHub. */
  url: string;
  /** The status as the board names it: `In Progress`, `Todo`, `Backlog`, `No status`. */
  status: string;
  column: Column;
  /** Carries a `priority:high` label. GitHub has no priority field, so nothing else is shown. */
  high: boolean;
  /** The `app:` label, without its prefix. Platform work carries none. */
  app: string | null;
  /** The `owner:` label, without its prefix. */
  owner: string | null;
  parked: boolean;
  /** An `Owner task` with an assignee, which here only ever means assigned to the owner. */
  waitingOnOwner: boolean;
  /** The first Next step not yet done. Null when there is none to show. */
  next: NextStep | null;
  updatedAt: string;
};

export type NextStep = { actor: string | null; text: string; star: boolean };

/** Where an issue sits on the board. `later` is Backlog, no status and anything parked. */
export type Column = "progress" | "review" | "todo" | "later";

export type PitWallData =
  | { ok: true; issues: PitIssue[]; readAt: string }
  | { ok: false; why: string; readAt: string };

const REPO = "Tech-Paddock/paddock-issues";
const ENDPOINT = `https://api.github.com/repos/${REPO}/issues`;
const TIMEOUT_MS = 4000;
const PAGE = 100;
/** A ceiling, not an expectation: five pages is 500 open issues. */
const MAX_PAGES = 5;

/** One item from GitHub's issues list, as far as the board reads it. */
export type GitHubIssue = {
  number: number;
  title: string;
  html_url: string;
  updated_at: string;
  body: string | null;
  labels?: (string | { name?: string | null })[] | null;
  /** Only its presence is read, never who it is. */
  assignee?: object | null;
  assignees?: object[] | null;
  /** Present when the "issue" is a pull request. */
  pull_request?: object;
};

/** Markdown down to the words a card shows: no emphasis, links, tags or code ticks. */
function plain(md: string): string {
  return md
    .replace(/https:\/\/linear\.app\/[\w-]+\/issue\/([A-Z]+-\d+)\S*/g, "$1")
    .replace(/https:\/\/github\.com\/Tech-Paddock\/paddock-issues\/issues\/(\d+)\S*/g, "#$1")
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
 * the rule in `CLAUDE.md` (the actor is one of Owner, TD, Builder or
 * Deployment), with the owner's ⭐ before or after it. The
 * way a step is marked finished has varied, so each of these counts as done:
 * "done", "skipped" or ✅ inside the bold lead (`**Done, 2026-09-25, Owner:**`),
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
    const raw = step.replace(/⭐️?/g, "").trim();
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

/** Status label → the name the board shows and its column. */
const STATUS: Record<string, { name: string; column: Column }> = {
  "status:backlog": { name: "Backlog", column: "later" },
  "status:todo": { name: "Todo", column: "todo" },
  "status:in-progress": { name: "In Progress", column: "progress" },
  "status:in-review": { name: "In Review", column: "review" },
};

/** The first `status:` label, matched without regard to case; none is "No status", in the last column. */
function statusOf(labels: string[]): { name: string; column: Column } {
  for (const l of labels) {
    const s = STATUS[l.trim().toLowerCase()];
    if (s) return s;
  }
  return { name: "No status", column: "later" };
}

/** Which board column a set of labels belongs in; anything parked goes last. */
export function columnOf(labels: string[], parked: boolean): Column {
  return parked ? "later" : statusOf(labels).column;
}

const labelValue = (labels: string[], prefix: string) =>
  labels.find((l) => l.toLowerCase().startsWith(prefix))?.slice(prefix.length).trim() || null;

/** Case, spaces, hyphens and underscores do not tell labels apart: `Owner task`, `owner-task`. */
const norm = (l: string) => l.trim().toLowerCase().replace(/[\s_-]+/g, " ");

/** `TEC-84: Title` gives `TEC-84` and the title without it; any other title gives `#n`. */
export function identify(number: number, title: string): { id: string; title: string } {
  const m = title.match(/^\s*(TEC-\d+)\s*:\s*(\S.*)$/i);
  return m ? { id: m[1].toUpperCase(), title: m[2] } : { id: `#${number}`, title };
}

/** One GitHub issue, narrowed to what the board shows. Pure, so it is tested directly. */
export function toIssue(n: GitHubIssue): PitIssue {
  const labels = (n.labels ?? []).map((l) => (typeof l === "string" ? l : l?.name ?? "")).filter(Boolean);
  const parked = labels.some((l) => norm(l) === "parked");
  const ownerTask = labels.some((l) => norm(l) === "owner task");
  const assigned = Boolean(n.assignee) || (n.assignees?.length ?? 0) > 0;
  const { id, title } = identify(n.number, n.title);
  return {
    number: n.number,
    id,
    title,
    url: n.html_url,
    status: statusOf(labels).name,
    column: columnOf(labels, parked),
    high: labels.some((l) => l.trim().toLowerCase() === "priority:high"),
    app: labelValue(labels, "app:"),
    owner: labelValue(labels, "owner:"),
    parked,
    waitingOnOwner: ownerTask && assigned,
    next: nextStep(n.body),
    updatedAt: n.updated_at,
  };
}

/** A failed request, as a sentence. */
function explain(error: unknown): string {
  if (!(error instanceof Error)) return "the request failed without saying why";
  if (error.name === "TimeoutError" || error.name === "AbortError") return `GitHub did not answer within ${TIMEOUT_MS / 1000} seconds`;
  const cause = (error as { cause?: unknown }).cause;
  const code = cause instanceof Error ? (cause as { code?: string }).code : undefined;
  return code ? `GitHub could not be reached (${code})` : `GitHub could not be reached (${error.message})`;
}

export async function loadPitWall(token: string | undefined = process.env.GITHUB_TOKEN): Promise<PitWallData> {
  const readAt = new Date().toISOString();
  if (!token) return { ok: false, why: "GITHUB_TOKEN is not set on home, so GitHub was not asked", readAt };

  const issues: PitIssue[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    let res: Response;
    try {
      res = await fetch(`${ENDPOINT}?state=open&per_page=${PAGE}&page=${page}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
    } catch (error) {
      return { ok: false, why: explain(error), readAt };
    }

    if (res.status === 401 || res.status === 403) {
      return { ok: false, why: `GitHub refused the token (${res.status}) — it may be expired or revoked, or lack Issues: read on ${REPO}`, readAt };
    }
    // GitHub answers 404, not 403, for a private repository a token cannot see.
    if (res.status === 404) {
      return { ok: false, why: `GitHub could not find ${REPO} for this token (404) — the token may not be granted that repository`, readAt };
    }
    if (!res.ok) return { ok: false, why: `GitHub answered ${res.status}`, readAt };

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, why: "GitHub's reply was not JSON", readAt };
    }
    if (!Array.isArray(body)) return { ok: false, why: "GitHub's reply was not a list of issues — its shape has changed", readAt };

    // The issues API returns pull requests too; they are not work items.
    issues.push(...(body as GitHubIssue[]).filter((i) => !i.pull_request).map(toIssue));
    if (body.length < PAGE) break;
  }

  return { ok: true, issues, readAt };
}
