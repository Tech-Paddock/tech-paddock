/**
 * Which file is an app's password gate, and is it the one Next.js will run?
 *
 * drift's checks 2, 2b and 2c call this. It is its own module, rather than
 * inline in drift-check.mjs, so that `gate-file.test.mjs` can hold it to fixture
 * apps: drift-check measures the repo it lives in and nothing else.
 *
 * ## Why the file name depends on the Next major (TEC-34)
 *
 * Next 14 and 15 run `middleware.ts`. Next 16 renamed the convention to
 * `proxy.ts`, which runs on the Node.js runtime only. Two of the four ways to
 * get that wrong are silent:
 *
 *   - **Next 14 ignores `proxy.ts` completely.** A 14 app with only `proxy.ts`
 *     builds clean, prints no warning and ships an empty middleware manifest —
 *     no password gate at all, so every route is public. Checked on the spike
 *     branch, 2026-10-18. A stamp, a copy or a half-done upgrade gets there.
 *   - **Next 16 still runs a lone `middleware.ts`**, on Edge, with a
 *     deprecation warning — a gate on a runtime and a name nothing here
 *     reviews any more.
 *
 * Both files together fail a 16 build, and on 14 the extra one is dead weight
 * that the next upgrade will trip over. So: exactly one gate file, and which one
 * is decided by the Next major the app actually gets, never by the name of the
 * file that happens to be there.
 *
 * ## Where the major comes from
 *
 * Every source the app has, and they must agree: the range in package.json,
 * the version in package-lock.json (what `npm ci` installs on Vercel and in
 * CI), and node_modules/next when it is installed. A disagreement is a
 * failure, not a guess: a package.json moved to 16 with a lockfile still on 14
 * is exactly the half-done upgrade in which the wrong gate file ships. A range
 * this cannot read (`latest`, `>=14`, `14 || 16`) fails too — it says nothing
 * about which major the next install picks.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** The first Next major that runs proxy.* instead of middleware.*. */
export const PROXY_FROM = 16;
export const GATE_NAMES = ["middleware", "proxy"];
/** Every extension Next.js resolves a gate file by. */
export const GATE_EXTS = ["ts", "js", "mjs", "cjs", "jsx", "tsx"];
/** Every file name either Next major would treat as a gate, at an app's root. */
export const GATE_FILES = GATE_NAMES.flatMap((n) => GATE_EXTS.map((e) => `${n}.${e}`));

const readText = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

/**
 * The major a dependency range pins, or null when the range does not pin one.
 * Deliberately narrow: an exact version, `^`, `~`, `=`, or `16`/`16.x`. Anything
 * wider is a range that can move majors on the next install.
 */
export function majorOfRange(range) {
  if (typeof range !== "string") return null;
  const m = range.trim().match(/^(?:[\^~]|=)?\s*v?(\d+)(?:\.(?:\d+|[xX*])){0,2}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
  return m ? Number(m[1]) : null;
}

/**
 * The Next major an app builds with: `{ major, sources }`, or `{ error }`.
 * `sources` is each place it was read from, for the detail line.
 */
export function nextMajor(appDir) {
  const found = [];
  const pkgText = readText(join(appDir, "package.json"));
  if (pkgText === null) return { error: "no package.json — cannot tell which Next.js it builds with" };
  let pkg;
  try { pkg = JSON.parse(pkgText); } catch { return { error: "package.json does not parse — cannot tell which Next.js it builds with" }; }
  const declared = pkg.dependencies?.next ?? pkg.devDependencies?.next;
  if (declared === undefined) return { error: "package.json declares no `next` — cannot tell which gate file it runs" };
  const d = majorOfRange(declared);
  if (d === null) return { error: `package.json declares next "${declared}", which pins no major — use an exact version or a ^/~ range` };
  found.push(["package.json", d, declared]);

  const lockText = readText(join(appDir, "package-lock.json"));
  if (lockText !== null) {
    let v;
    try { v = JSON.parse(lockText).packages?.["node_modules/next"]?.version; }
    catch { return { error: "package-lock.json does not parse — cannot tell which Next.js `npm ci` installs" }; }
    if (v !== undefined) {
      const l = majorOfRange(v);
      if (l === null) return { error: `package-lock.json locks next "${v}", which is not a version` };
      found.push(["package-lock.json", l, v]);
    }
  }

  const instText = readText(join(appDir, "node_modules", "next", "package.json"));
  if (instText !== null) {
    let v;
    try { v = JSON.parse(instText).version; } catch { v = undefined; }
    const i = majorOfRange(v);
    if (i === null) return { error: "node_modules/next/package.json has no readable version" };
    found.push(["node_modules", i, v]);
  }

  const majors = new Set(found.map(([, m]) => m));
  if (majors.size > 1)
    return { error: "its Next.js sources disagree — " + found.map(([s, , v]) => `${s} ${v}`).join(", ") +
      " — so which gate file runs depends on which one wins; finish the upgrade (npm install) so they agree" };
  return { major: d, sources: found.map(([s]) => s) };
}

/** The one gate file a given Next major runs, at the app root. */
export const gateFileFor = (major) => (major >= PROXY_FROM ? "proxy.ts" : "middleware.ts");

/**
 * Check 2b for one gated app: `{ major, want, bad }`. `bad` is every reason the
 * app is not behind exactly the gate file its Next major runs; empty is a pass.
 */
export function gateFileFindings(appDir) {
  const has = (rel) => existsSync(join(appDir, rel));
  const m = nextMajor(appDir);
  const bad = [];
  const strays = GATE_FILES.filter(has);
  if (m.error) {
    bad.push(m.error + (strays.length ? ` (it holds ${strays.join(", ")})` : ""));
    return { major: null, want: null, bad };
  }
  const want = gateFileFor(m.major);
  const wantName = want.replace(/\.ts$/, "");
  const otherName = GATE_NAMES.find((n) => n !== wantName);
  const N = `Next ${m.major}`;

  if (!has(want))
    bad.push(`no ${want} — ${N} runs only ${wantName}.*, so ${strays.length ? "the file it does have is not the reviewed gate" : "every route it serves is public"}`);

  for (const f of strays) {
    if (f === want) continue;
    if (f === `${otherName}.ts`)
      bad.push(otherName === "proxy"
        ? `proxy.ts — ${N} ignores proxy.ts without a warning: the build succeeds with no gate and every route is public`
        : `middleware.ts — on ${N} the gate is proxy.ts; middleware.ts beside it fails the build, and alone it runs on Edge as a deprecated gate nobody reviews`);
    else if (f.startsWith(`${wantName}.`))
      bad.push(`${f} — Next.js would run it instead of, or beside, the reviewed ${want}`);
    else
      bad.push(`${f} — not the gate file ${N} runs (${want}); a stray gate is either silently ignored or a second one nobody reviewed`);
  }

  if (has("src") && statSync(join(appDir, "src")).isDirectory()) {
    for (const f of readdirSync(join(appDir, "src")).filter((f) => /^(middleware|proxy)\./.test(f)))
      bad.push(`src/${f} — a second password gate nobody reviewed`);
    for (const d of ["app", "pages"])
      if (has(`src/${d}`)) bad.push(`src/${d}/ — with the app under src/, Next.js ignores the root ${want}`);
  }
  return { major: m.major, want, bad };
}

/**
 * A gate file's source with the exported function's name taken out, so that
 * the codemod's one-word rename (`middleware` → `proxy`) leaves a migrated app
 * in the same group. Nothing else is normalised: any other difference is a
 * different gate, which is what check 2 exists to see.
 */
export const normaliseGate = (src) =>
  src.replace(/\bexport(\s+)(async\s+)?function(\s+)(?:middleware|proxy)(\s*)\(/g,
    (_, s1, a, s2, s3) => `export${s1}${a ?? ""}function${s2}gate${s3}(`);

/**
 * The hash check 2 groups an app by: `{ hash, file }`, or `{ error }` when the
 * app has no gate file that can be read. Never a skip — an app missing from
 * the comparison is how a deleted gate once read `ok`.
 */
export function gateHash(appDir) {
  const m = nextMajor(appDir);
  if (m.error) return { error: m.error };
  const file = gateFileFor(m.major);
  const src = readText(join(appDir, file));
  if (src === null) return { error: `no ${file} to compare (Next ${m.major})` };
  return { hash: createHash("md5").update(normaliseGate(src)).digest("hex"), file };
}

/**
 * Check 2's verdict from every gated app's gateHash: `{ state, detail }`.
 * `results` is `[app, gateHash(app)]` pairs. Every gated app runs the one
 * stamped gate; a second version is a bypass nobody reviewed.
 */
export function gateShape(results) {
  const unreadable = results.filter(([, r]) => r.error);
  const groups = new Map();
  for (const [a, r] of results) if (!r.error) groups.set(r.hash, [...(groups.get(r.hash) ?? []), a]);
  const shape = [...groups.values()].map((g) => g.sort().join("+")).sort();
  const measured = shape.length ? ` — measured ${shape.join(" | ")}` : "";

  if (results.length === 0) return { state: "warn", detail: "no gated app on disk — cannot measure" };
  if (unreadable.length)
    return { state: "fail", detail:
      "no readable gate file, so the app is not in the comparison: " +
      unreadable.map(([a, r]) => `${a}: ${r.error}`).join("; ") + measured };
  if (groups.size > 1)
    return { state: "fail", detail:
      `more than one version of the password gate${measured}. ` +
      "Every app runs the stamped copy; a variant is a bypass nobody reviewed." };
  return { state: "ok", detail: `${results.length} on the one gate — ${shape[0]}` };
}
