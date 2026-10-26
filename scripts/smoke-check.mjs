#!/usr/bin/env node
/**
 * The signed-out smoke check (TEC-159): after a production deploy, probe the
 * live app the way a stranger would and fail if the gate does not hold.
 *
 *   node scripts/smoke-check.mjs                 # every app
 *   node scripts/smoke-check.mjs coffee          # one app, by slug
 *   SMOKE_ENVIRONMENT=... SMOKE_TARGET_URL=... node scripts/smoke-check.mjs --deployment
 *
 * Signed out only, always (.claude/DECISIONS.md): no password, no session, no
 * token. Every request is a GET and changes nothing.
 *
 * The app list is read from apps/home/lib/platform.ts, the one list of deployed
 * apps, and the expected headers from packages/shared/next.config.mjs, the one
 * copy of them. Nothing is retyped here, so a new app is probed the day it is
 * listed and a header change is followed rather than flagged as a failure.
 *
 * This container cannot reach *.techpaddock.io, so this runs in GitHub Actions
 * (.github/workflows/smoke.yml). Its logic is tested with a mocked fetch.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The cookie name the gate reads (packages/shared/lib/auth.ts). A forged value must never open it. */
export const SESSION_COOKIE = "paddock_session";

/** A path no route owns. The gate answers before routing, so it is 401 either way, and no real route is touched. */
export const API_PROBE_PATH = "/api/smoke-check-signed-out";

/**
 * Apps that are deployed, from platform.ts. Parked apps are paused on purpose
 * and sit after `PARKED`, so they are left out rather than reported as down.
 */
export function readApps(src = readFileSync(join(ROOT, "apps/home/lib/platform.ts"), "utf8")) {
  const live = src.split(/export const PARKED\b/)[0];
  const apps = [];
  const entry =
    /\{\s*slug:\s*"([a-z0-9-]+)"\s*,\s*name:\s*"[^"]*"\s*,\s*url:\s*"(https:\/\/[^"]+)"\s*,\s*vercelProject:\s*"([a-z0-9-]+)"\s*,?\s*\}/g;
  for (const m of live.matchAll(entry)) apps.push({ slug: m[1], url: m[2], vercelProject: m[3] });
  return apps;
}

/** The security headers every app sends, from the shared config: `{ lower-cased name: value }`. */
export function readExpectedHeaders(
  src = readFileSync(join(ROOT, "packages/shared/next.config.mjs"), "utf8"),
) {
  const out = {};
  for (const m of src.matchAll(/key:\s*"([A-Za-z-]+)"\s*,\s*value:\s*"([^"]*)"/g)) out[m[1].toLowerCase()] = m[2];
  return out;
}

// A whole-name match, so `tp-health` is not found inside `tp-healthy`.
const containsProject = (text, project) =>
  new RegExp(`(^|[^a-z0-9-])${project}($|[^a-z0-9-])`).test(text);

/**
 * Which app a GitHub `deployment_status` is about.
 *
 * Vercel names the environment `Production`, or `Production – <project>` when
 * one repository holds several projects, which this one does. That naming is
 * not confirmed from here, so this is defensive: the Vercel project name is
 * looked for in the environment first, then in the deployment's own URL
 * (`<project>-<hash>-<team>.vercel.app`) or the app's own host. The longest
 * project name wins, so `tp-coffee` could never swallow `tp-coffee-app`.
 *
 * Returns `{ skip }` for anything that is not production, `{ unknown }` for a
 * production deploy it cannot place (which fails the run: a silent skip is the
 * failure this check exists to remove), else `{ app }`.
 */
export function appForDeployment({ environment = "", targetUrl = "" }, apps) {
  const env = String(environment ?? "").toLowerCase();
  if (!env.startsWith("production")) return { skip: `environment "${environment}" is not production` };
  const byLength = [...apps].sort((a, b) => b.vercelProject.length - a.vercelProject.length);
  const inEnv = byLength.find((a) => containsProject(env, a.vercelProject));
  if (inEnv) return { app: inEnv };
  let host = "";
  try {
    host = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    /* no usable url */
  }
  const inUrl = byLength.find(
    (a) => host === new URL(a.url).hostname || (host && host.startsWith(`${a.vercelProject}-`)),
  );
  if (inUrl) return { app: inUrl };
  return {
    unknown: `production deployment (environment "${environment}", url "${targetUrl}") matches no project in platform.ts`,
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** One GET that never follows a redirect: the redirect is the thing being checked. Retried only on a network error. */
async function get(fetchFn, url, { cookie, tries = 3, sleep = wait } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetchFn(url, {
        method: "GET",
        redirect: "manual",
        headers: cookie ? { cookie } : {},
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      last = e;
      if (i < tries - 1) await sleep(2_000);
    }
  }
  throw new Error(`no response from ${url}: ${last?.message ?? last}`);
}

/** Null when redirected to /login on the same origin (any redirect status), else what is wrong. */
function toLogin(res, origin) {
  if (![301, 302, 303, 307, 308].includes(res.status)) return `status ${res.status}, wanted a redirect`;
  const loc = res.headers.get("location");
  if (!loc) return "redirect has no Location";
  let u;
  try {
    u = new URL(loc, origin);
  } catch {
    return `Location "${loc}" is not a URL`;
  }
  if (u.origin !== new URL(origin).origin) return `redirects off-site to ${u.origin}`;
  if (u.pathname !== "/login") return `redirects to ${u.pathname}, wanted /login`;
  return null;
}

/**
 * Every probe against one app. Returns `[{ name, ok, detail }]`; never throws,
 * so one dead probe does not hide the others.
 */
export async function probeApp(
  app,
  { fetchFn = fetch, expectedHeaders = readExpectedHeaders(), sleep = wait } = {},
) {
  const origin = app.url.replace(/\/$/, "");
  const results = [];
  const run = async (name, fn) => {
    try {
      const problem = await fn();
      results.push({ name, ok: !problem, detail: problem || "ok" });
    } catch (e) {
      results.push({ name, ok: false, detail: e.message });
    }
  };
  const forged = `${SESSION_COOKIE}=forged.${"0".repeat(64)}`;

  await run("/ redirects to /login", async () => toLogin(await get(fetchFn, `${origin}/`, { sleep }), origin));

  await run("/api/* answers 401", async () => {
    const res = await get(fetchFn, `${origin}${API_PROBE_PATH}`, { sleep });
    return res.status === 401 ? null : `status ${res.status}, wanted 401`;
  });

  await run("forged cookie is refused on a page", async () => {
    const res = await get(fetchFn, `${origin}/`, { cookie: forged, sleep });
    const problem = toLogin(res, origin);
    return problem && `forged cookie got through: ${problem}`;
  });

  await run("forged cookie is refused on /api/*", async () => {
    const res = await get(fetchFn, `${origin}${API_PROBE_PATH}`, { cookie: forged, sleep });
    return res.status === 401 ? null : `forged cookie got status ${res.status}, wanted 401`;
  });

  await run("security headers present", async () => {
    // /login is public, so its headers are the app's own, not the gate's.
    const res = await get(fetchFn, `${origin}/login`, { sleep });
    if (res.status >= 400) return `/login answered ${res.status}`;
    const wanted = Object.entries(expectedHeaders);
    if (!wanted.length) return "no expected headers could be read from packages/shared/next.config.mjs";
    const bad = [];
    for (const [name, value] of wanted) {
      const got = res.headers.get(name);
      if (got === null) bad.push(`${name} missing`);
      else if (got !== value) bad.push(`${name} is "${got}", wanted "${value}"`);
    }
    return bad.length ? bad.join("; ") : null;
  });

  return results;
}

/** Runs the chosen apps; returns `{ failed, lines }`. */
export async function smoke(apps, opts = {}) {
  const lines = [];
  let failed = 0;
  for (const app of apps) {
    const results = await probeApp(app, opts);
    lines.push(`${app.slug} (${app.url})`);
    for (const r of results) {
      if (!r.ok) failed++;
      lines.push(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : ` -- ${r.detail}`}`);
    }
  }
  return { failed, lines };
}

/** Turns the command line and the event's fields into the apps to probe, a skip, or an error. */
export function chooseApps(args, env, apps) {
  if (args.includes("--deployment")) {
    const hit = appForDeployment({ environment: env.SMOKE_ENVIRONMENT, targetUrl: env.SMOKE_TARGET_URL }, apps);
    if (hit.skip) return { skip: hit.skip };
    if (hit.unknown) return { error: hit.unknown };
    return { apps: [hit.app] };
  }
  const name = args.find((a) => !a.startsWith("--")) || "all";
  if (name === "all") return { apps };
  const one = apps.find((a) => a.slug === name);
  return one
    ? { apps: [one] }
    : { error: `no app "${name}" in platform.ts (have: ${apps.map((a) => a.slug).join(", ")})` };
}

async function main() {
  const apps = readApps();
  if (!apps.length) {
    console.error("::error::No apps could be read from apps/home/lib/platform.ts. Refusing to report a pass for nothing.");
    return 1;
  }
  const chosen = chooseApps(process.argv.slice(2), process.env, apps);
  if (chosen.skip) {
    console.log(`Skipped: ${chosen.skip}`);
    return 0;
  }
  if (chosen.error) {
    console.error(`::error::${chosen.error}`);
    return 1;
  }
  const { failed, lines } = await smoke(chosen.apps);
  console.log(lines.join("\n"));
  if (failed) {
    console.error(`::error::${failed} signed-out probe(s) failed`);
    return 1;
  }
  console.log(`\nAll signed-out probes passed for ${chosen.apps.map((a) => a.slug).join(", ")}.`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => process.exit(code));
}
