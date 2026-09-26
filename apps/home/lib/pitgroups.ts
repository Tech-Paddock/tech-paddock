import type { Column, PitIssue } from "./linear";

/**
 * How the Pit Wall arranges its issues — by status, or by agent. Joel's toggle.
 *
 * Its own module, and free of anything that fetches, because the toggle runs in
 * the browser over issues already on the page: switching it must never mean
 * another round trip to Linear.
 */

export type Grouping = "status" | "agent";

export function groupingFrom(value: string | null | undefined): Grouping {
  return value === "agent" ? "agent" : "status";
}

export const COLUMNS: { id: Exclude<Column, "later">; name: string }[] = [
  { id: "progress", name: "In Progress" },
  { id: "review", name: "In Review" },
  { id: "todo", name: "Todo" },
];

/**
 * The agents in the order `CLAUDE.md`'s *Who you are* table lists them. A label
 * not in this list still gets its own group, after these, rather than being
 * dropped — the board must never hide an issue for carrying a new name.
 */
const ROSTER = ["TD", "Deployment", "TechPad Gen", "Resume Formatter", "Coffee", "Health", "Cookbook"];

const STAGE: Record<Column, number> = { progress: 1, review: 2, todo: 3, later: 4 };

/** Urgent first, no priority last, then most recently touched. */
function byPriority(a: PitIssue, b: PitIssue) {
  const pa = a.priority === 0 ? 5 : a.priority;
  const pb = b.priority === 0 ? 5 : b.priority;
  if (pa !== pb) return pa - pb;
  return b.updatedAt.localeCompare(a.updatedAt);
}

/** Waiting on Joel is not a column: it is the band above the board, unless parked. */
export const needsJoel = (i: PitIssue) => i.waitingOnJoel && !i.parked;

export type StatusBoard = {
  joel: PitIssue[];
  columns: { id: Exclude<Column, "later">; name: string; issues: PitIssue[] }[];
  later: PitIssue[];
};

/** By status: what waits on Joel, then the three working columns, then what is parked or not started. */
export function byStatus(issues: PitIssue[]): StatusBoard {
  const rest = issues.filter((i) => !needsJoel(i));
  return {
    joel: issues.filter(needsJoel).sort(byPriority),
    columns: COLUMNS.map((c) => ({ ...c, issues: rest.filter((i) => i.column === c.id).sort(byPriority) })),
    later: rest.filter((i) => i.column === "later").sort(byPriority),
  };
}

export type AgentGroup = { agent: string; issues: PitIssue[] };

/** By agent: one group per `agent:` label, roster order, each ordered by how far along it is. */
export function byAgent(issues: PitIssue[]): AgentGroup[] {
  const names = new Set(issues.map((i) => i.agent ?? "No agent"));
  const known = ROSTER.filter((a) => names.has(a));
  const unknown = Array.from(names).filter((a) => !ROSTER.includes(a) && a !== "No agent").sort();
  const order = [...known, ...unknown, ...(names.has("No agent") ? ["No agent"] : [])];

  return order.map((agent) => ({
    agent,
    issues: issues
      .filter((i) => (i.agent ?? "No agent") === agent)
      .sort((a, b) => {
        // Waiting on Joel first, then by how far along, then by priority.
        const ja = needsJoel(a) ? 0 : STAGE[a.column];
        const jb = needsJoel(b) ? 0 : STAGE[b.column];
        return ja !== jb ? ja - jb : byPriority(a, b);
      }),
  }));
}
