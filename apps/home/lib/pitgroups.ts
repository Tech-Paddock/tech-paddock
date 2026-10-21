import type { Column, PitIssue } from "./linear";

/**
 * How the Pit Wall arranges its issues — by status, or by app, behind one toggle.
 *
 * Its own module, and free of anything that fetches, because the toggle runs in
 * the browser over issues already on the page: switching it must never mean
 * another round trip to Linear.
 */

export type Grouping = "status" | "app";

export function groupingFrom(value: string | null | undefined): Grouping {
  return value === "app" ? "app" : "status";
}

export const COLUMNS: { id: Exclude<Column, "later">; name: string }[] = [
  { id: "progress", name: "In Progress" },
  { id: "review", name: "In Review" },
  { id: "todo", name: "Todo" },
];

/**
 * The apps in a fixed order. A
 * label not in this list still gets its own group, after these, rather than
 * being dropped: the board must never hide an issue for carrying a new name.
 * Issues with no `app:` label are platform work and come last (TEC-115).
 */
const ROSTER = ["home", "resume", "coffee", "health", "cookbook", "lando", "showcase"];
const NONE = "Platform";

const STAGE: Record<Column, number> = { progress: 1, review: 2, todo: 3, later: 4 };

/** Urgent first, no priority last, then most recently touched. */
function byPriority(a: PitIssue, b: PitIssue) {
  const pa = a.priority === 0 ? 5 : a.priority;
  const pb = b.priority === 0 ? 5 : b.priority;
  if (pa !== pb) return pa - pb;
  return b.updatedAt.localeCompare(a.updatedAt);
}

/** Waiting on the owner is not a column: it is the band above the board, unless parked. */
export const needsOwner = (i: PitIssue) => i.waitingOnOwner && !i.parked;

export type StatusBoard = {
  waiting: PitIssue[];
  columns: { id: Exclude<Column, "later">; name: string; issues: PitIssue[] }[];
  later: PitIssue[];
};

/** By status: what waits on the owner, then the three working columns, then what is parked or not started. */
export function byStatus(issues: PitIssue[]): StatusBoard {
  const rest = issues.filter((i) => !needsOwner(i));
  return {
    waiting: issues.filter(needsOwner).sort(byPriority),
    columns: COLUMNS.map((c) => ({ ...c, issues: rest.filter((i) => i.column === c.id).sort(byPriority) })),
    later: rest.filter((i) => i.column === "later").sort(byPriority),
  };
}

export type AppGroup = { app: string; issues: PitIssue[] };

/** By app: one group per `app:` label, roster order, platform last, each ordered by how far along it is. */
export function byApp(issues: PitIssue[]): AppGroup[] {
  const names = new Set(issues.map((i) => i.app ?? NONE));
  const known = ROSTER.filter((a) => names.has(a));
  const unknown = Array.from(names).filter((a) => !ROSTER.includes(a) && a !== NONE).sort();
  const order = [...known, ...unknown, ...(names.has(NONE) ? [NONE] : [])];

  return order.map((app) => ({
    app,
    issues: issues
      .filter((i) => (i.app ?? NONE) === app)
      .sort((a, b) => {
        // Waiting on the owner first, then by how far along, then by priority.
        const ja = needsOwner(a) ? 0 : STAGE[a.column];
        const jb = needsOwner(b) ? 0 : STAGE[b.column];
        return ja !== jb ? ja - jb : byPriority(a, b);
      }),
  }));
}
