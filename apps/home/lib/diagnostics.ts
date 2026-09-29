/**
 * What is actually live, asked rather than assumed.
 *
 * Server-side only. Every probe runs from home's own server, so no secret and
 * no result reaches the browser except as the narrow shapes below.
 *
 * Home holds no database credential: it proves nothing *about* a tool's
 * internals, it only asks each tool a question the tool answers for itself.
 * Adding an app is a line in `platform.ts`, not new knowledge here.
 *
 * Three things this deliberately does:
 *  - It never reports an environment variable's value, only whether it is set.
 *  - It never guesses. Anything it cannot reach is "unknown", with the reason,
 *    because a dashboard that fills gaps with optimism is worse than no
 *    dashboard.
 *  - **It says what failed, in words.** A bare "404" sends you to look it up;
 *    "Vercel has no deployment at this address" tells you where to go. The raw
 *    code rides along after the sentence, so nothing is lost in translation.
 */
import { HOME, HOME_ENV, HOME_ENV_RETIRED, PROBED, type Project } from "./platform";
import { deployErrors } from "./deploys";

/** `parked` is a probe that did not come back up for an app paused on purpose. */
export type Status = "up" | "down" | "unknown" | "parked";

export type Probe = {
  target: string;
  status: Status;
  /** What happened, as a sentence. */
  detail: string;
  /** The code or message it was read from — a status, a Vercel error, a socket error. Null when there is none. */
  raw: string | null;
  /** Round-trip in milliseconds, when the probe actually completed a request. */
  ms: number | null;
};

/** An environment problem on this deployment, tagged with what it breaks. */
export type EnvError = { name: string; affects: string; problem: string };

export type Diagnostics = {
  checkedAt: string;
  liveness: Probe[];
  /** Empty is the healthy state, and The Garage then shows nothing at all. */
  deploys: Probe[];
  /** Empty is the healthy state, and The Garage then shows nothing at all. */
  envErrors: EnvError[];
};

type Outcome = Omit<Probe, "ms" | "target">;

/** A slow or dead host must not hold the page hostage. */
const TIMEOUT_MS = 4000;

/**
 * Vercel names its own refusals in an `x-vercel-error` header. It is the most
 * precise thing a failed probe can say, so it is read before the status code.
 * A name not listed here is still shown, verbatim, rather than dropped.
 */
const VERCEL_ERRORS: Record<string, string> = {
  DEPLOYMENT_PAUSED: "the Vercel project is paused",
  DEPLOYMENT_DISABLED: "Vercel has disabled this deployment",
  DEPLOYMENT_BLOCKED: "Vercel has blocked this deployment",
  DEPLOYMENT_DELETED: "the deployment at this address was deleted",
  DEPLOYMENT_NOT_FOUND: "Vercel has no deployment at this address",
  NOT_FOUND: "Vercel found nothing at this path",
  DNS_HOSTNAME_NOT_FOUND: "Vercel could not resolve the address it routes to",
  FUNCTION_INVOCATION_FAILED: "the app crashed answering",
  FUNCTION_INVOCATION_TIMEOUT: "the app took too long to answer",
  MIDDLEWARE_INVOCATION_FAILED: "the app's middleware crashed",
  MIDDLEWARE_INVOCATION_TIMEOUT: "the app's middleware took too long",
  NO_RESPONSE_FROM_FUNCTION: "the app sent no response",
};

/** What a status code means, when Vercel did not name the error itself. */
function statusMeans(status: number): string {
  if (status === 401 || status === 403) return "the app refused the request";
  if (status === 404) return "nothing is served at this path";
  if (status === 429) return "rate-limited";
  if (status >= 300 && status < 400) return "redirected instead of answering";
  if (status >= 500) return "the app failed answering";
  return "an answer this page does not expect";
}

/**
 * A response that was not 2xx, as a sentence plus the code it came from.
 * Exported for the tests.
 */
export function explainResponse(status: number, vercelError: string | null): { detail: string; raw: string } {
  const code = vercelError?.trim() || null;
  const raw = code ? `${status} ${code}` : String(status);
  if (code) return { detail: VERCEL_ERRORS[code] ?? `Vercel refused it (${code})`, raw };
  return { detail: statusMeans(status), raw };
}

/**
 * Node's fetch reports a DNS failure, a TLS failure and a refused connection as
 * the same "fetch failed", and puts the real cause underneath. Which one it was
 * is the most useful thing on the page, so unwrap it and say it.
 * Exported for the tests.
 */
export function explainError(error: unknown): { detail: string; raw: string | null } {
  if (!(error instanceof Error)) return { detail: "the request failed without saying why", raw: null };
  if (error.name === "TimeoutError" || error.name === "AbortError") {
    return { detail: `no answer within ${TIMEOUT_MS / 1000} seconds`, raw: error.name };
  }
  const cause = (error as { cause?: unknown }).cause;
  const code = cause instanceof Error ? (cause as { code?: string }).code : undefined;
  const raw = code ?? (cause instanceof Error ? cause.message : error.message);
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return { detail: "the address did not resolve — DNS", raw };
  if (code === "ECONNREFUSED") return { detail: "the connection was refused", raw };
  if (code === "ECONNRESET" || code === "UND_ERR_SOCKET") return { detail: "the connection was dropped", raw };
  if (code && /CERT|TLS|SSL|SIGNATURE/.test(code)) return { detail: "the certificate was not accepted — TLS", raw };
  return { detail: "the request failed before an answer came back", raw };
}

async function timed(run: () => Promise<Outcome>, target: string): Promise<Probe> {
  const started = Date.now();
  try {
    const result = await run();
    return { target, ...result, ms: Date.now() - started };
  } catch (error) {
    return { target, status: "down", ...explainError(error), ms: Date.now() - started };
  }
}

/**
 * A parked app is paused on purpose, so its not answering is expected rather
 * than a fault. The reason is kept — "paused" is worth confirming, and anything
 * else is worth knowing — but the row is grey, never red.
 * Exported for the tests.
 */
export function forParked(probe: Probe, parked: boolean): Probe {
  if (!parked || probe.status === "up") return probe;
  return { ...probe, status: "parked", detail: `parked, so expected: ${probe.detail}` };
}

/**
 * Liveness, without needing anything from the app being probed.
 *
 * `/login` is unauthenticated on every app by design, so a 200 proves the whole
 * chain home cares about: DNS resolved, TLS terminated, Vercel routed to a
 * project, Next.js booted, and middleware ran. It proves nothing about that
 * app's database or keys.
 */
async function livenessProbe(project: Project & { parked?: true }) {
  const probe = await timed(async () => {
    const res = await fetch(`${project.url}/login`, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return { status: "up" as const, detail: "answering", raw: null };
    return { status: "down" as const, ...explainResponse(res.status, res.headers.get("x-vercel-error")) };
  }, project.name);
  return forParked(probe, !!project.parked);
}

/**
 * Only what is wrong. Presence only: no value is read into a variable that
 * could be rendered.
 *
 * Reports what *this deployment* was built with, not what the Vercel dashboard
 * currently says: the environment is baked into the function at deploy time,
 * so a fix made in the dashboard clears here only after a redeploy.
 * Exported for the tests, with the environment passed in.
 */
export function envErrors(env: Record<string, string | undefined> = process.env): EnvError[] {
  const missing = HOME_ENV.filter((e) => e.unsetMeans !== null && !env[e.name]).map((e) => ({
    name: e.name,
    affects: e.affects,
    problem: `not set — ${e.unsetMeans}`,
  }));
  const retired = HOME_ENV_RETIRED.filter((e) => !!env[e.name]).map((e) => ({
    name: e.name,
    affects: e.affects,
    problem: e.why,
  }));
  return [...missing, ...retired];
}

/**
 * Home is not probed over the public internet.
 *
 * If this code is running, home booted and is serving — fetching its own
 * public URL to rediscover that adds a failure mode rather than a signal.
 */
const homeProbe: Probe = {
  target: HOME.name,
  status: "up",
  detail: "serving this page",
  raw: null,
  ms: null,
};

export async function runDiagnostics(): Promise<Diagnostics> {
  const others = PROBED.filter((p) => p.slug !== HOME.slug);
  const [liveness, deploys] = await Promise.all([Promise.all(others.map(livenessProbe)), deployErrors()]);

  return {
    checkedAt: new Date().toISOString(),
    liveness: [homeProbe, ...liveness],
    deploys,
    envErrors: envErrors(),
  };
}
