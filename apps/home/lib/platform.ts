/**
 * What the platform is *supposed* to be.
 *
 * The Garage's job is to show where what is live has fallen away from this. So
 * everything here is either committed in the repo or generated from it —
 * nothing is a number somebody remembered.
 *
 * Two halves:
 *  - `PROJECTS` below: the app-to-subdomain-to-Vercel-project mapping. It has
 *    no other home in the repo. It is hand-written, but it is the *contract*,
 *    which is exactly the kind of thing that should be hand-written and
 *    reviewed.
 *  - `DECLARED` in ./declared.generated.ts: which apps expose `/api/summary`
 *    and `/api/health`, read out of the repo at build time by
 *    scripts/collect-declared.mjs.
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
  hasHealthRoute: boolean;
  hasSummaryRoute: boolean;
};

export type Declared = {
  generatedAt: string;
  /** False when the generator could not see the monorepo. */
  complete: boolean;
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
  /**
   * One plain sentence on what the check means, when the drift check supplies
   * one. Absent today; The Garage falls back to its own per-family sentence.
   */
  explain?: string;
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
 * plain strings is what lets home's presentation table be checked for
 * completeness at compile time — add a tool here and the shell stops building
 * until it has been given an icon.
 *
 * **Array order is the sidebar's order**, and it is Joel's, not alphabetical
 * and not the order these were built in.
 *
 * **The Message Editor is deliberately absent**, removed 2026-09-19 on the same
 * terms as the tracker below: out of the roster entirely rather than out of the
 * sidebar alone. `apps/editor` is untouched and `editor.techpaddock.io` still
 * serves — it is simply not one of the tools home lists or embeds.
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

/** The tools home embeds — everything except home itself. */
export const TOOLS: Tool[] = [
  { slug: "resume", name: "Resume Formatter", url: "https://resume.techpaddock.io", vercelProject: "tp-resume" },
  { slug: "coffee", name: "Coffee", url: "https://coffee.techpaddock.io", vercelProject: "tp-coffee-app" },
  { slug: "health", name: "Health", url: "https://health.techpaddock.io", vercelProject: "tp-health" },
  { slug: "cookbook", name: "Cookbook", url: "https://cookbook.techpaddock.io", vercelProject: "tp-cookbook" },
];

export const HOME: Project = {
  slug: "home",
  name: "Home",
  url: "https://techpaddock.io",
  vercelProject: "tp-home",
};

/**
 * Projects home depends on but does not embed — the glance calls the tracker's
 * `/api/summary`, so whether it answers and whether it holds the same secret
 * are home's business even while it has no sidebar row.
 *
 * **Parked means paused on purpose.** Joel pauses a parked app's Vercel
 * project, so it not answering is expected: The Garage shows it grey, never
 * red.
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

/** What home embeds and deploys, home first. */
export const PROJECTS: Project[] = [HOME, ...TOOLS];

/**
 * What home probes: everything it embeds, plus what it depends on without
 * embedding. Liveness, the shared-secret check and the Pit Wall's deployment
 * rows all read this, never `TOOLS` — that was how the tracker went unprobed.
 */
export const PROBED: (Project & { parked?: true })[] = [...PROJECTS, ...PARKED];

/**
 * An environment variable home reads, and what breaks without it.
 *
 * The Garage lists none of these by default. A name appears only when it is an
 * error, tagged with `affects` — the app, or the part of home, that stops
 * working. `unsetMeans` is null where leaving the name unset is normal, which is
 * what keeps an override from ever reading as an error.
 *
 * Presence is reported; a value is never read for display, only tested for
 * existence.
 */
export type HomeEnv = { name: string; affects: string; unsetMeans: string | null };

export const HOME_ENV: HomeEnv[] = [
  { name: "SESSION_SECRET", affects: "Login", unsetMeans: "home cannot sign anyone in" },
  { name: "APP_PASSWORD_HASH", affects: "Login", unsetMeans: "the password gate has nothing to check against" },
  {
    name: "INTERNAL_API_SECRET",
    affects: "Morning Paper",
    unsetMeans: "the glance asks no tool anything, and no shared secret can be tested",
  },
  { name: "GITHUB_TOKEN", affects: "Pit Wall", unsetMeans: "the Pit Wall has no pull requests, branches or deployments" },
  { name: "TRACKER_BASE_URL", affects: "Morning Paper", unsetMeans: null },
];

/**
 * Names this app used to read and no longer does. An error only while still
 * set, because a credential nothing reads is a credential that can only leak.
 * `VERCEL_TOKEN` was a full-power team token held for one read, and the Pit Wall
 * now reads deployment state from GitHub's deployment statuses instead.
 */
export const HOME_ENV_RETIRED: { name: string; affects: string; why: string }[] = [
  {
    name: "VERCEL_TOKEN",
    affects: "Home",
    why: "still set, and nothing reads it — the Pit Wall reads deployments from GitHub. Delete it from tp-home.",
  },
];
