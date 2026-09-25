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
 * **The Message Editor is deliberately absent**, removed 2026-09-19 on the same
 * terms as the tracker below: out of the roster entirely rather than out of the
 * sidebar alone. `apps/editor` is untouched and `editor.techpaddock.io` still
 * serves — it is simply not one of the tools the hub lists or embeds.
 *
 * **The Pipeline Tracker is deliberately absent from the tools.** It is parked
 * (Joel, 2026-09-24), so it has no sidebar row and no frame. It is still the
 * glance's only source, though, so it is in `PARKED` below and The Garage and
 * the Pit Wall still probe it — embedding a tool and depending on one are
 * different questions. Un-parking it means moving its entry from there to here.
 * `apps/tracker` is untouched and still builds in CI — the roster CI derives
 * comes from the folders on disk, never from this file.
 *
 * **A tool is listed here on the platform's word, not on hope**: its latest
 * production deployment is ready and its domain verified, both read off the
 * deployment state rather than a project field, which is the rule this app has
 * been caught by before. A tool listed and down is a question with an answer; a
 * tool missing from here is invisible.
 */
export type ToolSlug = "resume" | "coffee" | "health" | "cookbook";

export type Tool = Project & { slug: ToolSlug };

/** The tools the hub embeds — everything except the hub itself. */
export const TOOLS: Tool[] = [
  { slug: "resume", name: "Resume Formatter", url: "https://resume.techpaddock.io", vercelProject: "tp-resume" },
  { slug: "coffee", name: "Coffee", url: "https://coffee.techpaddock.io", vercelProject: "tp-coffee-app" },
  { slug: "health", name: "Health", url: "https://health.techpaddock.io", vercelProject: "tp-health" },
  { slug: "cookbook", name: "Cookbook", url: "https://cookbook.techpaddock.io", vercelProject: "tp-cookbook" },
];

export const HUB: Project = {
  slug: "home",
  name: "Paddock hub",
  url: "https://techpaddock.io",
  vercelProject: "tp-home",
};

/**
 * Projects the hub depends on but does not embed — the glance calls the
 * tracker's `/api/summary`, so whether it answers and whether it holds the same
 * secret are the hub's business even while it has no sidebar row.
 */
export const PARKED: (Project & { parked: true })[] = [
  {
    slug: "tracker",
    name: "Pipeline Tracker",
    url: "https://tracker.techpaddock.io",
    vercelProject: "tp-tracker",
    parked: true,
  },
];

/** What the hub embeds and deploys, hub first. The Garage's Declared table. */
export const PROJECTS: Project[] = [HUB, ...TOOLS];

/**
 * What the hub probes: everything it embeds, plus what it depends on without
 * embedding. Liveness, the shared-secret check and the Pit Wall's deployment
 * rows all read this, never `TOOLS` — that was how the tracker went unprobed.
 */
export const PROBED: (Project & { parked?: true })[] = [...PROJECTS, ...PARKED];

export type HubEnv = { name: string; optional: boolean; why: string };

/**
 * The environment variables this app reads. Presence is reported; a value is
 * never read for display, only tested for existence. `.env.example` declares
 * the same names — the Garage's Declared panel reads that file, this list is
 * what the running deployment is asked about.
 */
export const HUB_ENV: HubEnv[] = [
  { name: "SESSION_SECRET", optional: false, why: "the shared login cookie" },
  { name: "APP_PASSWORD_HASH", optional: false, why: "the password gate" },
  { name: "INTERNAL_API_SECRET", optional: false, why: "the glance's request to each tool" },
  { name: "GITHUB_TOKEN", optional: true, why: "the Pit Wall: pull requests, branches, deployments" },
  { name: "TRACKER_BASE_URL", optional: true, why: "overrides https://tracker.techpaddock.io" },
];

/**
 * Names this app used to read and no longer does. Reported only if still set,
 * because a credential nothing reads is a credential that can only leak.
 * `VERCEL_TOKEN` was a full-power team token held for one read, and the Pit Wall
 * now reads deployment state from GitHub's deployment statuses instead.
 */
export const HUB_ENV_RETIRED: { name: string; why: string }[] = [
  { name: "VERCEL_TOKEN", why: "no longer read — the Pit Wall reads deployments from GitHub. Delete it from tp-home." },
];
