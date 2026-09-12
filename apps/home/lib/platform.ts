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
 * The four embeddable tools, as a closed set. Keeping the slugs a union rather
 * than plain strings is what lets the hub's tile table be checked for
 * completeness at compile time — add a tool here and the shell stops building
 * until it has been given a colour and an icon.
 */
export type ToolSlug = "editor" | "tracker" | "resume" | "coffee";

export type Tool = Project & { slug: ToolSlug };

/** The tools the hub embeds — everything except the hub itself. */
export const TOOLS: Tool[] = [
  { slug: "editor", name: "Message Editor", url: "https://editor.techpaddock.io", vercelProject: "tp-message-editor" },
  { slug: "tracker", name: "Pipeline Tracker", url: "https://tracker.techpaddock.io", vercelProject: "tp-tracker" },
  { slug: "resume", name: "Resume Formatter", url: "https://resume.techpaddock.io", vercelProject: "tp-resume" },
  { slug: "coffee", name: "Coffee", url: "https://coffee.techpaddock.io", vercelProject: "tp-coffee-app" },
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
