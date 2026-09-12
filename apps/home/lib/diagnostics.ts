/**
 * What is actually live, asked rather than assumed.
 *
 * Server-side only. Every probe runs from the hub's own server, so no secret
 * and no result reaches the browser except as the narrow shapes below.
 *
 * The hub still holds no keys: it proves nothing *about* a tool's internals,
 * it only asks each tool a question the tool answers for itself. Adding an app
 * is a line in PROJECTS, not new knowledge here.
 *
 * Two things this deliberately does NOT do:
 *  - It never reports an environment variable's value, only whether it is set.
 *  - It never guesses. Anything it cannot reach is "unknown", with the reason,
 *    because a dashboard that fills gaps with optimism is worse than no
 *    dashboard. This project already has a status document that asserts things
 *    nobody re-verified; the point of this page is to not be a second one.
 */
import { HUB, HUB_ENV_NAMES, TOOLS, type Project } from "./platform";

export type Status = "up" | "down" | "unknown";

export type Probe = {
  target: string;
  status: Status;
  detail: string;
  /** Round-trip in milliseconds, when the probe actually completed a request. */
  ms: number | null;
};

export type EnvCheck = { name: string; set: boolean };

export type Diagnostics = {
  checkedAt: string;
  liveness: Probe[];
  internal: Probe[];
  hubEnv: EnvCheck[];
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

/**
 * Liveness, without needing anything from the app being probed.
 *
 * `/login` is unauthenticated on all five apps by design, so a 200 proves the
 * whole chain the hub cares about: DNS resolved, TLS terminated, Vercel routed
 * to a project, Next.js booted, and middleware ran. It proves nothing about
 * that app's database or keys — that is what /api/health is for, and the hub
 * cannot reach those yet.
 */
function livenessProbe(project: Project) {
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
  }, project.name);
}

/**
 * Proves the hub and the tracker hold the *same* INTERNAL_API_SECRET.
 *
 * Tracker's middleware carves /api/summary out of the password gate for
 * exactly this header, so a 200 means the secrets match and a 401 means they
 * have drifted apart — which is otherwise silent, and is the same class of
 * failure as a SESSION_SECRET mismatch.
 *
 * Only the tracker is checked because only the tracker has such a carve-out
 * today. The other three tools need one before this can say anything about
 * them, and that is auth plumbing, which is the TD's to change.
 */
function sharedSecretProbe(project: Project, path: string) {
  const label = `${project.name} · shared secret`;
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
    if (res.ok) return { status: "up" as const, detail: `${path} accepted the hub's secret` };
    if (res.status === 401 || res.status === 403) {
      return {
        status: "down" as const,
        detail: `${path} rejected the hub's secret — the two projects hold different values`,
      };
    }
    return { status: "unknown" as const, detail: `${path} answered ${res.status}` };
  }, label);
}

/**
 * Presence only. No value is read into a variable that could be rendered.
 *
 * Reports what *this deployment* was built with, not what the Vercel dashboard
 * currently says: the environment is baked into the serverless function at
 * deploy time, so reading process.env per request still reads the deployment's
 * environment. A setting changed since the last deploy reads as it was until a
 * redeploy. The page says so rather than letting the number imply otherwise.
 */
function hubEnv(): EnvCheck[] {
  return HUB_ENV_NAMES.map((name) => ({ name, set: !!process.env[name] }));
}

/**
 * The hub is not probed over the public internet.
 *
 * If this code is running, the hub booted and is serving — fetching its own
 * public URL to rediscover that adds a failure mode rather than a signal, and
 * would report "down" whenever egress is restricted while the page is visibly
 * working. Reporting a tautology honestly beats reporting a false negative.
 */
const hubProbe: Probe = {
  target: HUB.name,
  status: "up",
  detail: "serving this page — not probed over the network",
  ms: null,
};

export async function runDiagnostics(): Promise<Diagnostics> {
  const tracker = TOOLS.find((t) => t.slug === "tracker");

  const [toolLiveness, internal] = await Promise.all([
    Promise.all(TOOLS.map(livenessProbe)),
    Promise.all(tracker ? [sharedSecretProbe(tracker, "/api/summary")] : []),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    liveness: [hubProbe, ...toolLiveness],
    internal,
    hubEnv: hubEnv(),
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
