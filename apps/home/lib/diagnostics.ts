/**
 * What is actually live, asked rather than assumed.
 *
 * Server-side only. Every probe runs from the hub's own server, so no secret
 * and no result reaches the browser except as the narrow shapes below.
 *
 * The hub holds no database credential: it proves nothing *about* a tool's
 * internals, it only asks each tool a question the tool answers for itself.
 * Adding an app is a line in `platform.ts`, not new knowledge here.
 *
 * Two things this deliberately does NOT do:
 *  - It never reports an environment variable's value, only whether it is set.
 *  - It never guesses. Anything it cannot reach is "unknown", with the reason,
 *    because a dashboard that fills gaps with optimism is worse than no
 *    dashboard.
 */
import {
  HUB,
  HUB_ENV,
  HUB_ENV_RETIRED,
  PROBED,
  type DeclaredApp,
  type Project,
} from "./platform";
import { DECLARED } from "./declared.generated";

export type Status = "up" | "down" | "unknown";

export type Probe = {
  target: string;
  status: Status;
  detail: string;
  /** Round-trip in milliseconds, when the probe actually completed a request. */
  ms: number | null;
};

export type EnvCheck = { name: string; set: boolean; optional: boolean; why: string };

export type Diagnostics = {
  checkedAt: string;
  liveness: Probe[];
  internal: Probe[];
  hubEnv: EnvCheck[];
  /** Retired names that are still set. Empty is the healthy state. */
  retiredSet: { name: string; why: string }[];
};

/** A slow or dead host must not hold the page hostage. Matches lib/glance.ts. */
const TIMEOUT_MS = 4000;

async function timed(run: () => Promise<Omit<Probe, "ms" | "target">>, target: string): Promise<Probe> {
  const started = Date.now();
  try {
    const result = await run();
    return { target, ...result, ms: Date.now() - started };
  } catch (error) {
    // A DNS failure, a TLS failure and a refused connection are all "did not
    // answer" from here, and which one it was is the single most useful thing
    // on the page. Node's fetch reports every one of them as the same
    // "fetch failed", and puts the real cause underneath — so unwrap it.
    return { target, status: "down", detail: describe(error), ms: Date.now() - started };
  }
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return "threw a non-error";
  if (error.name === "TimeoutError") return `no answer within ${TIMEOUT_MS}ms`;
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as { code?: string }).code;
    return code ? `${code} — ${cause.message}` : cause.message;
  }
  return error.message;
}

const parkedNote = (project: Project & { parked?: true }) => (project.parked ? " (parked)" : "");

/**
 * Liveness, without needing anything from the app being probed.
 *
 * `/login` is unauthenticated on every app by design, so a 200 proves the whole
 * chain the hub cares about: DNS resolved, TLS terminated, Vercel routed to a
 * project, Next.js booted, and middleware ran. It proves nothing about that
 * app's database or keys.
 */
function livenessProbe(project: Project & { parked?: true }) {
  return timed(async () => {
    const res = await fetch(`${project.url}/login`, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return { status: "up" as const, detail: `${res.status} from ${project.url}/login` };
    return {
      status: "down" as const,
      detail: `${res.status} ${res.statusText || ""}`.trim() + ` from ${project.url}/login`,
    };
  }, `${project.name}${parkedNote(project)}`);
}

/**
 * What a status code from a secret-guarded route means about the secret.
 *
 * 401 and 403 are the middleware refusing the header — the two projects hold
 * different values. Anything else that is not 2xx says nothing about the secret
 * either way, so it is "unknown" with the code, never "up".
 */
export function classifySecretStatus(status: number, path: string): Omit<Probe, "ms" | "target"> {
  if (status >= 200 && status < 300) {
    return { status: "up", detail: `${path} accepted the hub's secret` };
  }
  if (status === 401 || status === 403) {
    return {
      status: "down",
      detail: `${path} rejected the hub's secret — the two projects hold different values`,
    };
  }
  return { status: "unknown", detail: `${path} answered ${status}` };
}

/**
 * Proves the hub and a tool hold the *same* INTERNAL_API_SECRET.
 *
 * A tool's middleware carves its `/api/summary` out of the password gate for
 * exactly this header, so a mismatch — otherwise silent, and the same class of
 * failure as a SESSION_SECRET mismatch — shows here as a rejection.
 */
function sharedSecretProbe(project: Project & { parked?: true }, path: string) {
  const label = `${project.name}${parkedNote(project)} · shared secret`;
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    return Promise.resolve<Probe>({
      target: label,
      status: "unknown",
      detail: "INTERNAL_API_SECRET is not set on the hub, so this cannot be tested",
      ms: null,
    });
  }
  return timed(async () => {
    const res = await fetch(`${project.url}${path}`, {
      headers: { "x-internal-secret": secret },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return classifySecretStatus(res.status, path);
  }, label);
}

/**
 * Presence only. No value is read into a variable that could be rendered.
 *
 * Reports what *this deployment* was built with, not what the Vercel dashboard
 * currently says: the environment is baked into the serverless function at
 * deploy time, so a setting changed since the last deploy reads as it was until
 * a redeploy. The page says so rather than letting the number imply otherwise.
 */
function hubEnv(): EnvCheck[] {
  return HUB_ENV.map((e) => ({ ...e, set: !!process.env[e.name] }));
}

function retiredSet() {
  return HUB_ENV_RETIRED.filter((e) => !!process.env[e.name]);
}

/**
 * The hub is not probed over the public internet.
 *
 * If this code is running, the hub booted and is serving — fetching its own
 * public URL to rediscover that adds a failure mode rather than a signal.
 */
const hubProbe: Probe = {
  target: HUB.name,
  status: "up",
  detail: "serving this page — not probed over the network",
  ms: null,
};

/**
 * Which projects get the shared-secret probe is *derived*, not named: whichever
 * probed project exposes `/api/summary`, read out of the repo at build time. It
 * used to filter `TOOLS`, which the tracker — the one app with that route — had
 * left, so the only secret the glance depends on was never checked.
 */
export function secretSubjects<P extends Project>(probed: P[], declared: DeclaredApp[]): P[] {
  const exposesSummary = new Set(declared.filter((app) => app.hasSummaryRoute).map((app) => app.slug));
  return probed.filter((project) => exposesSummary.has(project.slug));
}

export async function runDiagnostics(): Promise<Diagnostics> {
  const others = PROBED.filter((p) => p.slug !== HUB.slug);
  const [liveness, internal] = await Promise.all([
    Promise.all(others.map(livenessProbe)),
    Promise.all(secretSubjects(others, DECLARED.apps).map((p) => sharedSecretProbe(p, "/api/summary"))),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    liveness: [hubProbe, ...liveness],
    internal,
    hubEnv: hubEnv(),
    retiredSet: retiredSet(),
  };
}

export function countByStatus(probes: Probe[]) {
  return {
    up: probes.filter((p) => p.status === "up").length,
    down: probes.filter((p) => p.status === "down").length,
    unknown: probes.filter((p) => p.status === "unknown").length,
  };
}

/** Severity classes already exist in globals.css; this maps a probe onto them. */
export function severityFor(status: Status) {
  return status === "down" ? "urgent" : status === "unknown" ? "warn" : "info";
}
