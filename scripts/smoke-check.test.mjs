/**
 * The cases the signed-out smoke check is held to, with a mocked fetch. Run:
 *
 *   node --test scripts/smoke-check.test.mjs
 *
 * A fake app answers like a healthy Paddock app unless a case breaks one part
 * of it, so each failing probe is proven to fail for the right reason and the
 * others are proven to stay green.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  API_PROBE_PATH, SESSION_COOKIE, appForDeployment, chooseApps, probeApp, readApps, readExpectedHeaders, smoke,
} from "./smoke-check.mjs";

const ORIGIN = "https://x.techpaddock.io";
const APP = { slug: "x", url: ORIGIN, vercelProject: "tp-x" };
const FRAME = "frame-ancestors 'self' https://techpaddock.io https://*.techpaddock.io";
const HEADERS = {
  "content-security-policy": FRAME,
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};
const noSleep = async () => {};

/** A fetch that behaves like a healthy app; `over(path, init)` may replace any answer. */
function fake(over = () => undefined) {
  const calls = [];
  const fn = async (url, init) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, init });
    const custom = over(u.pathname, init);
    if (custom) return custom instanceof Error ? Promise.reject(custom) : custom;
    if (u.pathname === "/login") return new Response("login", { status: 200, headers: HEADERS });
    if (u.pathname.startsWith("/api")) return new Response("{}", { status: 401 });
    return new Response(null, { status: 307, headers: { location: `${ORIGIN}/login?from=%2F` } });
  };
  fn.calls = calls;
  return fn;
}

const probe = (over, app = APP) =>
  probeApp(app, { fetchFn: fake(over), expectedHeaders: HEADERS, sleep: noSleep });
const verdict = async (over) => Object.fromEntries((await probe(over)).map((r) => [r.name, r.ok]));
const NAMES = {
  root: "/ redirects to /login",
  api: "/api/* answers 401",
  forgedPage: "forged cookie is refused on a page",
  forgedApi: "forged cookie is refused on /api/*",
  headers: "security headers present",
};

test("a healthy app passes every probe", async () => {
  const r = await probe();
  assert.equal(r.length, 5);
  for (const p of r) assert.ok(p.ok, `${p.name}: ${p.detail}`);
});

test("probes are GETs that do not follow redirects, and carry no credential but the forged cookie", async () => {
  const f = fake();
  await probeApp(APP, { fetchFn: f, expectedHeaders: HEADERS, sleep: noSleep });
  for (const c of f.calls) {
    assert.equal(c.init.method, "GET");
    assert.equal(c.init.redirect, "manual");
    for (const k of Object.keys(c.init.headers)) assert.equal(k, "cookie");
    if (c.init.headers.cookie) assert.ok(c.init.headers.cookie.startsWith(`${SESSION_COOKIE}=forged`));
  }
  assert.ok(f.calls.some((c) => c.init.headers.cookie), "the forged cookie is actually sent");
});

test("root: a 200 instead of a redirect fails", async () => {
  const v = await verdict((p) => (p === "/" ? new Response("home", { status: 200 }) : undefined));
  assert.equal(v[NAMES.root], false);
  assert.equal(v[NAMES.api], true);
});

test("root: a redirect to somewhere other than /login fails", async () => {
  const v = await verdict((p, i) => (p === "/" && !i.headers.cookie ? new Response(null, { status: 307, headers: { location: "/dashboard" } }) : undefined));
  assert.equal(v[NAMES.root], false);
});

test("root: a redirect off-site fails, even to a /login path", async () => {
  const v = await verdict((p) => (p === "/" ? new Response(null, { status: 302, headers: { location: "https://evil.example/login" } }) : undefined));
  assert.equal(v[NAMES.root], false);
  assert.equal(v[NAMES.forgedPage], false);
});

test("root: a relative Location and any redirect status pass", async () => {
  const v = await verdict((p) => (p === "/" ? new Response(null, { status: 308, headers: { location: "/login" } }) : undefined));
  assert.equal(v[NAMES.root], true);
});

test("root: a redirect without Location fails", async () => {
  const v = await verdict((p) => (p === "/" ? new Response(null, { status: 307 }) : undefined));
  assert.equal(v[NAMES.root], false);
});

test("api: anything but 401 fails (200, 403, 404, 500)", async () => {
  for (const status of [200, 403, 404, 500]) {
    const v = await verdict((p, i) => (p === API_PROBE_PATH && !i.headers.cookie ? new Response("{}", { status }) : undefined));
    assert.equal(v[NAMES.api], false, `status ${status}`);
    assert.equal(v[NAMES.forgedApi], true);
  }
});

test("forged cookie: letting it through a page fails only that probe", async () => {
  const v = await verdict((p, i) => (p === "/" && i.headers.cookie ? new Response("signed in", { status: 200 }) : undefined));
  assert.equal(v[NAMES.forgedPage], false);
  assert.equal(v[NAMES.root], true);
});

test("forged cookie: letting it through an API route fails only that probe", async () => {
  const v = await verdict((p, i) => (p === API_PROBE_PATH && i.headers.cookie ? new Response("{}", { status: 200 }) : undefined));
  assert.equal(v[NAMES.forgedApi], false);
  assert.equal(v[NAMES.api], true);
});

test("headers: each one missing or changed fails", async () => {
  for (const name of Object.keys(HEADERS)) {
    const missing = { ...HEADERS };
    delete missing[name];
    let v = await verdict((p) => (p === "/login" ? new Response("l", { status: 200, headers: missing }) : undefined));
    assert.equal(v[NAMES.headers], false, `${name} missing`);
    v = await verdict((p) => (p === "/login" ? new Response("l", { status: 200, headers: { ...HEADERS, [name]: "wrong" } }) : undefined));
    assert.equal(v[NAMES.headers], false, `${name} changed`);
  }
});

test("headers: a frame-ancestors that allows anyone fails, and the detail names it", async () => {
  const r = await probe((p) => (p === "/login" ? new Response("l", { status: 200, headers: { ...HEADERS, "content-security-policy": "frame-ancestors *" } }) : undefined));
  const h = r.find((x) => x.name === NAMES.headers);
  assert.equal(h.ok, false);
  assert.match(h.detail, /content-security-policy/);
});

test("headers: a broken /login fails rather than passing on nothing", async () => {
  const v = await verdict((p) => (p === "/login" ? new Response("oops", { status: 500, headers: HEADERS }) : undefined));
  assert.equal(v[NAMES.headers], false);
});

test("headers: no expected headers readable is a failure, not a pass", async () => {
  const r = await probeApp(APP, { fetchFn: fake(), expectedHeaders: {}, sleep: noSleep });
  assert.equal(r.find((x) => x.name === NAMES.headers).ok, false);
});

test("a network error is retried, then fails that probe without hiding the rest", async () => {
  let n = 0;
  const flaky = (p) => (p === API_PROBE_PATH && ++n === 1 ? new Error("ECONNRESET") : undefined);
  assert.equal((await verdict(flaky))[NAMES.api], true, "one blip is retried");
  const dead = (p, i) => (p === API_PROBE_PATH && !i.headers.cookie ? new Error("ENOTFOUND") : undefined);
  const r = await probe(dead);
  const api = r.find((x) => x.name === NAMES.api);
  assert.equal(api.ok, false);
  assert.match(api.detail, /ENOTFOUND/);
  assert.equal(r.find((x) => x.name === NAMES.root).ok, true);
});

test("smoke reports failures per app and counts them", async () => {
  const bad = fake((p) => (p === "/" ? new Response("x", { status: 200 }) : undefined));
  const { failed, lines } = await smoke([APP], { fetchFn: bad, expectedHeaders: HEADERS, sleep: noSleep });
  assert.equal(failed, 2); // the page, and the forged cookie on the page
  assert.ok(lines.some((l) => l.includes("FAIL") && l.includes(NAMES.root)));
});

// ---- the app list and the headers come from the repo, not from this file ----

test("the app list is read from platform.ts: home and every tool, none retyped", () => {
  const apps = readApps();
  assert.deepEqual(apps.map((a) => a.slug).sort(), ["coffee", "cookbook", "health", "home", "lando", "resume"]);
  const coffee = apps.find((a) => a.slug === "coffee");
  assert.equal(coffee.url, "https://coffee.techpaddock.io");
  assert.equal(coffee.vercelProject, "tp-coffee-app");
  assert.equal(apps.find((a) => a.slug === "home").url, "https://techpaddock.io");
});

test("readApps follows the file: a new tool appears, a parked one does not", () => {
  const src = `
    export const TOOLS = [
      { slug: "a", name: "A", url: "https://a.techpaddock.io", vercelProject: "tp-a" },
    ];
    export const HOME = { slug: "home", name: "Home", url: "https://techpaddock.io", vercelProject: "tp-home" };
    export const PARKED = [{ slug: "z", name: "Z", url: "https://z.techpaddock.io", vercelProject: "tp-z", parked: true }];
  `;
  assert.deepEqual(readApps(src).map((a) => a.slug), ["a", "home"]);
});

test("expected headers are the shared config's, and include the frame-ancestors allowlist", () => {
  const h = readExpectedHeaders();
  assert.equal(h["content-security-policy"], FRAME);
  assert.equal(h["x-content-type-options"], "nosniff");
  assert.ok(h["referrer-policy"]);
});

// ---- mapping a deployment to an app ----

const APPS = readApps();
const slugOf = (d) => appForDeployment(d, APPS).app?.slug;

test("deployment mapping: by project name in the environment, with either dash", () => {
  assert.equal(slugOf({ environment: "Production – tp-coffee-app" }), "coffee");
  assert.equal(slugOf({ environment: "Production - tp-health" }), "health");
  assert.equal(slugOf({ environment: "production – tp-home" }), "home");
});

test("deployment mapping: falls back to the deployment URL, then the app's own host", () => {
  assert.equal(slugOf({ environment: "Production", targetUrl: "https://tp-cookbook-abc123-team.vercel.app" }), "cookbook");
  assert.equal(slugOf({ environment: "Production", targetUrl: "https://lando.techpaddock.io" }), "lando");
});

test("deployment mapping: the longest project name wins, and a name inside another is not a match", () => {
  const apps = [
    { slug: "coffee", url: "https://c.example", vercelProject: "tp-coffee" },
    { slug: "coffee-app", url: "https://ca.example", vercelProject: "tp-coffee-app" },
  ];
  assert.equal(appForDeployment({ environment: "Production – tp-coffee-app" }, apps).app.slug, "coffee-app");
  assert.equal(appForDeployment({ environment: "Production – tp-coffee-apps" }, apps).app, undefined);
});

test("deployment mapping: previews are skipped; an unplaceable production deploy is unknown, not skipped", () => {
  assert.ok(appForDeployment({ environment: "Preview – tp-coffee-app" }, APPS).skip);
  assert.ok(appForDeployment({ environment: undefined }, APPS).skip);
  assert.ok(appForDeployment({ environment: "Production", targetUrl: "https://other.vercel.app" }, APPS).unknown);
  assert.ok(appForDeployment({ environment: "Production" }, APPS).unknown);
});

// ---- what to run ----

test("chooseApps: all, one by slug, an unknown slug, and a deployment", () => {
  assert.equal(chooseApps([], {}, APPS).apps.length, APPS.length);
  assert.equal(chooseApps(["all"], {}, APPS).apps.length, APPS.length);
  assert.equal(chooseApps([""], {}, APPS).apps.length, APPS.length);
  assert.deepEqual(chooseApps(["lando"], {}, APPS).apps.map((a) => a.slug), ["lando"]);
  assert.match(chooseApps(["nope"], {}, APPS).error, /nope/);
  const dep = (environment, targetUrl) => chooseApps(["--deployment"], { SMOKE_ENVIRONMENT: environment, SMOKE_TARGET_URL: targetUrl }, APPS);
  assert.deepEqual(dep("Production – tp-resume").apps.map((a) => a.slug), ["resume"]);
  assert.ok(dep("Preview").skip);
  assert.ok(dep("Production", "").error);
});
