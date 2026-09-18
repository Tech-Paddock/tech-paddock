/**
 * What the platform is *supposed* to be.
 *
 * The admin page's job is to show the gap between this and what is actually
 * live. So everything here is either committed in the repo or generated from
 * it — nothing is a number somebody remembered.
 *
 * Two halves:
 *  - `PROJECTS` below: the app-to-subdomain-to-Vercel-project mapping. It has
 *    no other home in the repo. It is hand-written, but it is the *contract*,
 *    which is exactly the kind of thing that should be hand-written and
 *    reviewed; the page's purpose is to catch reality drifting away from it.
 *  - `DECLARED` in ./declared.generated.ts: environment variable names, CI
 *    matrix, migration count and which apps expose which routes, all read out
 *    of the repo at build time by scripts/collect-declared.mjs.
 *
 * This file holds no secret and reads no environment value. It is imported by
 * a client component, so it must never learn how to.
 */

export type Project = {
  slug: string;
  name: string;
  /** Public origin. Its /login is unauthenticated on every app, which is what makes liveness probing possible. */
  url: string;
  /** Vercel project names carry a `tp-` prefix and deliberately do not match the folder or subdomain. */
  vercelProject: string;
};

export type DeclaredApp = {
  slug: string;
  envNames: string[];
  hasHealthRoute: boolean;
  hasSummaryRoute: boolean;
  hasTestScript: boolean;
};

export type Declared = {
  generatedAt: string;
  /** False when the generator could not see the monorepo, so the page can say so instead of showing an empty table as fact. */
  complete: boolean;
  ciMatrix: string[];
  migrationCount: number | null;
  apps: DeclaredApp[];
};

/**
 * One rules-drift check, as `scripts/drift-check.mjs --json` reports it.
 *
 * `ok` means measured and matching. `warn` means measured and drifting, and it
 * is also what a check reports when it could not measure its own subject —
 * deliberately, because the one thing it must never do is report `ok` for
 * something it did not look at. `fail` means a rule in `CLAUDE.md` is now false.
 *
 * The shape is the technical director's, not this app's. Changing it changes
 * what The Garage can render.
 */
export type DriftState = "ok" | "warn" | "fail";

export type DriftCheck = {
  name: string;
  state: DriftState;
  detail: string;
};

export type Drift = {
  /** When the check ran — which is this deployment's build, not now. */
  generatedAt: string;
  /** False when the check could not be run or its output could not be read. */
  complete: boolean;
  /** Why it could not be measured. Empty when complete. */
  reason: string;
  checks: DriftCheck[];
  counts: Record<DriftState, number>;
};

/**
 * The embeddable tools, as a closed set. Keeping the slugs a union rather than
 * plain strings is what lets the hub's presentation table be checked for
 * completeness at compile time — add a tool here and the shell stops building
 * until it has been given an icon.
 *
 * **Array order is the sidebar's order**, and it is Joel's, not alphabetical
 * and not the order these were built in.
 *
 * **The Pipeline Tracker is deliberately absent.** `tp-tracker` is paused, so
 * every entry it had here pointed somewhere that does not answer: a sidebar row,
 * an iframe target, and a row in The Garage's table. Joel removed it from all
 * three on 2026-09-18 rather than from the sidebar alone.
 *
 * **Health is deliberately present before it serves.** `tp-health` has no Root
 * Directory and no domain attached yet, so until those are set its sidebar row
 * and frame lead nowhere. That is the intended state rather than an oversight:
 * this file is what the platform is *supposed* to be, and The Garage's job is to
 * show the gap. A tool missing from here is invisible; a tool listed and down is
 * a question with an answer.
 * **The cost of that is recorded rather than hidden**: the hub no longer states
 * anywhere that `tp-tracker` is supposed to exist, so un-parking it means
 * putting this entry back. `apps/tracker` is untouched and still builds in CI —
 * the roster CI derives comes from the folders on disk, never from this file.
 */
export type ToolSlug = "resume" | "coffee" | "editor" | "health";

export type Tool = Project & { slug: ToolSlug };

/** The tools the hub embeds — everything except the hub itself. */
export const TOOLS: Tool[] = [
  { slug: "resume", name: "Resume Formatter", url: "https://resume.techpaddock.io", vercelProject: "tp-resume" },
  { slug: "coffee", name: "Coffee", url: "https://coffee.techpaddock.io", vercelProject: "tp-coffee-app" },
  { slug: "editor", name: "Message Editor", url: "https://editor.techpaddock.io", vercelProject: "tp-message-editor" },
  { slug: "health", name: "Health", url: "https://health.techpaddock.io", vercelProject: "tp-health" },
];

export const HUB: Project = {
  slug: "home",
  name: "Paddock hub",
  url: "https://techpaddock.io",
  vercelProject: "tp-home",
};

/** Everything the platform deploys, hub first. */
export const PROJECTS: Project[] = [HUB, ...TOOLS];

/**
 * The environment variables this app reads. Presence is reported; a value is
 * never read for display, only tested for existence.
 */
export const HUB_ENV_NAMES = [
  "SESSION_SECRET",
  "APP_PASSWORD_HASH",
  "INTERNAL_API_SECRET",
  "TRACKER_BASE_URL",
] as const;
