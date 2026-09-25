#!/usr/bin/env node
/**
 * The mechanical half of the weekly rules-drift audit.
 *
 * Every check here answers a question about the repo by MEASURING it, never by
 * reading a document that claims to know. That distinction is the whole point:
 * the facts this project has lost have all been prose copies of something
 * computable — test counts documented as 60 and 52 when the suite was 120,
 * "built, not yet deployed" on an app that had been live for four days, a
 * `SESSION_SECRET` note naming four apps when there are five.
 *
 * What is NOT here, deliberately: anything requiring judgement. Whether a
 * charter contradicts the code, whether a rule is duplicated in spirit rather
 * than in words — those need a reader, and they belong to the weekly audit
 * session, not to a script that would have to guess.
 *
 *   node scripts/drift-check.mjs          human-readable, exit 1 on any FAIL
 *   node scripts/drift-check.mjs --json   machine-readable, always exit 0
 *
 * The JSON shape is the contract The Garage renders. Every check reports one of
 * three states and never anything else:
 *   ok      measured, and it matches what the rules say
 *   warn    measured, and it is drifting — approaching a budget, going stale
 *   fail    measured, and a rule is now false
 * A check that cannot measure its own subject reports `warn` with the reason.
 * It never reports `ok` for something it did not look at, which is the same
 * rule The Garage already runs on: never claim more than the source supports.
 */

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { expected as stampExpected, MANIFEST, SHARED_DIR } from "./stamp-shared.mjs";
import { watchedBy, buildReads, covers } from "./build-scope.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const R = (...p) => join(repoRoot, ...p);

const checks = [];
const add = (name, state, detail) => checks.push({ name, state, detail });

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);
const lines = (p) => { const t = read(p); return t === null ? null : t.split("\n").length - (t.endsWith("\n") ? 1 : 0); };
const md5 = (p) => (existsSync(p) ? createHash("md5").update(readFileSync(p)).digest("hex") : null);

const APPS = existsSync(R("apps"))
  ? readdirSync(R("apps")).filter((d) => statSync(R("apps", d)).isDirectory()).sort()
  : [];

const git = (...args) => {
  try { return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim(); }
  catch { return null; }
};

/* Tracked files matching a pathspec, repo-relative. Without git (a build that
   ships no .git) it walks the tree instead and says so, so a caller can report
   what it actually scanned rather than claiming the tracked set. */
const SKIP_DIRS = new Set(["node_modules", ".git", ".next"]);
function trackedFiles(test, pathspecs) {
  const out = git("ls-files", "-z", "--", ...pathspecs);
  if (out !== null) return { files: out.split("\0").filter((f) => f && test(f)), how: "tracked" };
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(R(d))) {
      if (SKIP_DIRS.has(e)) continue;
      const rel = d ? `${d}/${e}` : e;
      if (statSync(R(rel)).isDirectory()) walk(rel); else if (test(rel)) files.push(rel);
    }
  };
  walk("");
  return { files, how: "walked (git unavailable)" };
}

/* One job's block from a workflow file, by indentation rather than a YAML
   parser (there is no root package.json to install one into). The block runs
   from `<indent><name>:` to the next line at the job's indentation or less,
   comments included. null when the job is not there. */
function yamlJob(yml, name) {
  const ls = yml.split("\n");
  const start = ls.findIndex((l) => /^jobs:\s*(#.*)?$/.test(l));
  if (start < 0) return null;
  const first = ls.slice(start + 1).find((l) => /^\s+[^\s#]/.test(l));
  if (!first) return null;
  const indent = first.match(/^\s*/)[0];
  const head = new RegExp(`^${indent}${name}:\\s*(#.*)?$`);
  const at = ls.findIndex((l, i) => i > start && head.test(l));
  if (at < 0) return null;
  let end = at + 1;
  while (end < ls.length && !(/\S/.test(ls[end]) && ls[end].match(/^\s*/)[0].length <= indent.length)) end++;
  return ls.slice(at, end).join("\n");
}

/* 1 ── Files the rules call byte-identical across every app.
   A mismatch in the auth pair does not throw; it silently rejects valid
   sessions on every other app, which looks like a login bug rather than a
   config one. theme.css drifts loudly by comparison, but it is still one more
   file that would otherwise be edited once per app.

   next.config.mjs joined the list on 2026-09-19. It carries the security
   headers, and it is the one file here where drift is silent by construction:
   a missing header changes nothing anybody can see. apps/home had shipped with
   an empty config and no frame-ancestors for as long as the file existed, and
   nothing said so until somebody read every copy side by side. */
for (const rel of ["lib/auth.ts", "lib/password.ts", "lib/theme.css", "lib/theme.ts", "next.config.mjs"]) {
  const present = APPS.map((a) => [a, md5(R("apps", a, rel))]).filter(([, h]) => h);
  if (present.length === 0) { add(`identical: ${rel}`, "warn", "not present in any app — cannot measure"); continue; }
  const distinct = new Set(present.map(([, h]) => h));
  add(
    `identical: ${rel}`,
    distinct.size === 1 ? "ok" : "fail",
    distinct.size === 1
      ? `${present.length} copies, all ${[...distinct][0].slice(0, 8)}`
      : `${distinct.size} distinct versions across ${present.length} copies: ` +
        present.map(([a, h]) => `${a}=${h.slice(0, 8)}`).join(", "),
  );
}

/* 1b ── The copies match packages/shared, which is the file they came from.
   Check 1 asks whether the copies agree with each other. That was the only
   question worth asking while there was no original: copies that all agree are
   correct no matter which one somebody edited. Since packages/shared exists
   there IS an original, and "they all agree" stops being sufficient — every
   copy can agree perfectly and every one disagree with the canonical file,
   which is exactly what happens when an agent edits one copy and helpfully
   syncs the rest.

   So this is the stronger question and check 1 is deliberately kept rather than
   replaced: it still answers on a branch where packages/shared has been deleted
   or has not landed, and on the password gate two overlapping checks are worth
   more than a tidy single one.

   `expected()` is imported from the stamper rather than reimplemented, so the
   check cannot drift from the writer it is checking. A reimplementation here
   would be a sixth copy of the thing this whole change exists to stop. */
{
  const name = "stamped copies match packages/shared";
  if (!existsSync(R(SHARED_DIR))) {
    add(name, "warn", `${SHARED_DIR} is not present — nothing to stamp from`);
  } else {
    const missingCanonical = MANIFEST
      .filter(({ from }) => !existsSync(R(SHARED_DIR, from)))
      .map(({ from }) => `${SHARED_DIR}/${from}`);

    if (missingCanonical.length) {
      add(name, "fail", `canonical file missing: ${missingCanonical.join(", ")}`);
    } else {
      const rows = stampExpected(repoRoot);
      const bad = rows.filter(({ rel, want }) => read(R(rel)) !== want);
      add(name, bad.length === 0 ? "ok" : "fail",
        bad.length === 0
          ? `${rows.length} copies across ${APPS.length} apps match — one edit, not ${APPS.length}`
          : `${bad.length} of ${rows.length} copies disagree: ` +
            bad.map(({ rel }) => rel).join(", ") +
            " — run: node scripts/stamp-shared.mjs");
    }
  }
}

/* 2 ── middleware.ts is deliberately NOT uniform, and the shape is the rule:
   `editor` adds a scoped /api/draft bypass, `tracker` adds /api/summary and
   waves /api/cron/* through, and every other app shares one base copy. An agent
   who checks, finds three variants and concludes the rule is wrong has been
   handed that conclusion by the rule itself — so measure the shape, not a count.

   The two exceptions are named because they are a documented fact about those
   two apps, not a roster: adding a sixth app does not change what editor's
   bypass is for. The base group is deliberately unnamed, so a new app that
   copies it is correct work and passes. A new app that brings its OWN variant
   fails here on purpose — that is a fourth version of the password gate, and
   it either belongs in CLAUDE.md in the same pull request or it should not
   exist. Collapsing everything to one copy fails for the opposite reason. */
{
  const present = APPS.map((a) => [a, md5(R("apps", a, "middleware.ts"))]).filter(([, h]) => h);
  const groups = new Map();
  for (const [a, h] of present) groups.set(h, [...(groups.get(h) ?? []), a]);
  const shape = [...groups.values()].map((g) => g.sort().join("+")).sort();
  const name = "middleware.ts: a base copy plus the two scoped bypasses";

  const owns = (app) => [...groups.values()].some((g) => g.length === 1 && g[0] === app);
  const missing = ["editor", "tracker"].filter((a) => !present.some(([app]) => app === a));
  const base = [...groups.values()].filter((g) => !(g.length === 1 && (g[0] === "editor" || g[0] === "tracker")));

  if (present.length === 0) add(name, "warn", "no middleware.ts in any app — cannot measure");
  else if (missing.length) add(name, "warn", `cannot measure: no middleware.ts in ${missing.join(", ")}`);
  else if (!owns("editor") || !owns("tracker"))
    add(name, "fail",
      "editor and tracker must each have a variant of their own — measured " + shape.join(" | ") +
      ". A shared one means a scoped bypass was copied into an app that was never reviewed for it.");
  else if (base.length > 1)
    add(name, "fail",
      "a fourth version of the password gate — measured " + shape.join(" | ") +
      ". Use the base copy, or document the new variant in CLAUDE.md in this same pull request.");
  else if (base.length === 0)
    add(name, "fail", "only editor and tracker have middleware.ts; nothing is running the base copy");
  else
    add(name, "ok", `${base[0].length} on the base copy, editor and tracker scoped — ${shape.join(" | ")}`);
}

/* 2b ── The password gate EXISTS in every app, which check 2 cannot see.
   Check 2 compares the middleware.ts files that are there; an app with none is
   simply not in the comparison, so deleting one, or scaffolding a tool without
   one, made the base group smaller and still read `ok`. An app with no
   middleware serves every route in public, its service-role API routes
   included — the "Vercel project serving an unprotected page" incident in
   CLAUDE.md. Next.js also has other places it looks: a middleware.js, or
   src/middleware.* once the app lives under src/. Any of those would replace or
   bypass the reviewed file, so each one fails here rather than passing quietly. */
{
  const name = "password gate: every app has middleware.ts";
  const apps = APPS.filter((a) => existsSync(R("apps", a, "package.json")));
  const bad = [];
  for (const a of apps) {
    const has = (rel) => existsSync(R("apps", a, rel));
    if (!has("middleware.ts")) bad.push(`${a}: no middleware.ts — every route it serves is public`);
    for (const alt of ["middleware.js", "middleware.mjs", "middleware.cjs", "middleware.jsx", "middleware.tsx"])
      if (has(alt)) bad.push(`${a}: ${alt} — Next.js would run it instead of, or beside, the reviewed middleware.ts`);
    if (has("src")) {
      const srcAlt = readdirSync(R("apps", a, "src")).filter((f) => /^middleware\./.test(f));
      for (const f of srcAlt) bad.push(`${a}: src/${f} — a second password gate nobody reviewed`);
      for (const d of ["app", "pages"])
        if (has(`src/${d}`)) bad.push(`${a}: src/${d}/ — with the app under src/, Next.js ignores the root middleware.ts`);
    }
  }
  if (apps.length === 0) add(name, "warn", "no app folder with a package.json — cannot measure");
  else add(name, bad.length ? "fail" : "ok",
    bad.length ? bad.join("; ") : `${apps.length} apps, each behind apps/<app>/middleware.ts and nothing else`);
}

/* 3 ── CI builds whatever is on disk, and one fixed name gates it.
   A hardcoded matrix does not fail when an app is missing from it — the app is
   simply never built. A per-app required-check list has the same shape of
   problem from the other side: deprecating an app leaves a required check that
   can never report. Both are fixed by deriving the roster and putting one
   stable job in front, so this checks that neither has been undone.

   It reads the parts that carry the weight, not just the names. The first
   version passed with `if: always()` deleted, with the gate no longer waiting
   on the builds, and with `fromJson('["home"]')` as the matrix — each of which
   leaves `gate:` and `fromJson(` in the file while undoing what they are for. */
{
  const ci = read(R(".github/workflows/ci.yml"));
  if (!ci) {
    add("CI derives its roster from apps/", "warn", "ci.yml not readable");
    add("one stable gate in front of CI", "warn", "ci.yml not readable");
  } else {
    const literal = ci.match(/app:\s*\[([^\]]+)\]/);
    const matrix = yamlJob(ci, "build")?.match(/^\s+app:[ \t]*(.*)$/m)?.[1]?.replace(/\s+#.*$/, "").replace(/\s+/g, "");
    if (literal) {
      const listed = literal[1].split(",").map((s) => s.trim()).filter(Boolean);
      const missing = APPS.filter((a) => !listed.includes(a));
      add("CI derives its roster from apps/", missing.length === 0 ? "warn" : "fail",
        missing.length === 0
          ? "matrix is hardcoded again — it matches today, but a new app will be skipped in silence"
          : `matrix is hardcoded AND already wrong — untested: ${missing.join(", ")}`);
    } else if (matrix === "${{fromJson(needs.roster.outputs.apps)}}") {
      add("CI derives its roster from apps/", "ok", `derived — ${APPS.length} app folders will build`);
    } else if (matrix) {
      add("CI derives its roster from apps/", "fail",
        `the build matrix is \`${matrix}\`, not \`\${{ fromJson(needs.roster.outputs.apps) }}\` — whatever it lists is all that builds`);
    } else {
      add("CI derives its roster from apps/", "fail", "no build job with an `app:` matrix found in ci.yml");
    }

    const gate = yamlJob(ci, "gate");
    if (gate === null) {
      add("one stable gate in front of CI", "fail",
        "the gate job is gone; required checks are per-app again and break on every roster change");
    } else {
      const inner = gate.split("\n").slice(1).find((l) => /^\s+\S/.test(l) && !/^\s*#/.test(l))?.match(/^\s*/)[0] ?? "    ";
      const key = (k) => {
        const m = gate.match(new RegExp(`^${inner}${k}:[ \\t]*(.*)$`, "m"));
        if (m) m[1] = m[1].replace(/\s+#.*$/, ""); // a trailing YAML comment is not part of the value
        return m;
      };
      const needsLine = key("needs");
      let needs = [];
      if (needsLine) {
        const v = needsLine[1].trim();
        if (v.startsWith("[")) needs = v.replace(/[[\]\s]/g, "").split(",").filter(Boolean);
        else if (v) needs = [v];
        else {
          for (const l of gate.slice(needsLine.index).split("\n").slice(1)) {
            const item = l.match(new RegExp(`^${inner}\\s+-\\s*([\\w-]+)\\s*$`));
            if (!item) break;
            needs.push(item[1]);
          }
        }
      }
      const ifv = key("if")?.[1].replace(/\s+/g, "").replace(/^\$\{\{(.*)\}\}$/, "$1");
      const missingNeeds = ["roster", "build", "drift"].filter((n) => !needs.includes(n));
      const bad = [];
      if (missingNeeds.length) bad.push(`gate no longer waits on ${missingNeeds.join(", ")} — it can go green while they are red`);
      if (ifv !== "always()") bad.push(`gate's job-level \`if\` is ${ifv ? `\`${ifv}\`` : "missing"}, not \`always()\` — when a dependency fails the gate is SKIPPED instead of failing`);
      add("one stable gate in front of CI", bad.length ? "fail" : "ok",
        bad.length ? bad.join("; ") : "gate waits on roster, build and drift, and runs always() — branch protection needs only that name");
    }
  }
}

/* ── Each app's Vercel build is scoped to its own folder ──────────────────
   Until 2026-09-19 every `ignoreCommand` read "skip previews, build
   everything else", which cannot see which folder changed. One merge rebuilt
   every app, and since Vercel aliases whichever build finishes LAST rather
   than the newest commit, two merges close together could leave an app
   serving the older one. It did: three merges four minutes apart on
   2026-09-18 left techpaddock.io on the Coffee-icon build.

   The command now diffs HEAD^..HEAD against this app's own folder. That makes
   a typo catastrophic in a way the old one never was: an app whose command
   names a DIFFERENT app's folder stops deploying entirely, silently, forever
   — nothing errors, no check goes red, and the only symptom is "my change did
   not go live", which is the most expensive failure this project has. So this
   check fails rather than warns, and it verifies the folder each command
   names is the folder it lives in.

   `packages` rides in every pathspec because `packages/shared` is stamped
   into every app, so a change there must rebuild all of them.

   A command with no `git diff` at all is the other legal shape: it builds
   every production merge, so it cannot name the wrong folder. The hub has
   used it since TEC-10, because its build reads nearly the whole repo — see
   the next check.

   A missing vercel.json is only a warning: a freshly scaffolded app folder
   has no Vercel project yet either, and CLAUDE.md promises that creating the
   folder is enough to make CI build it. */
{
  const hard = [], soft = [];
  for (const app of APPS) {
    const rel = `apps/${app}/vercel.json`;
    const raw = read(R(rel));
    if (raw === null) { soft.push(`${app}: no vercel.json, so every merge rebuilds it`); continue; }
    let cfg;
    try { cfg = JSON.parse(raw); } catch { hard.push(`${app}: vercel.json is not valid JSON`); continue; }
    const cmd = cfg.ignoreCommand;
    if (typeof cmd !== "string") { hard.push(`${app}: no ignoreCommand, so every merge rebuilds it`); continue; }
    if (!/VERCEL_ENV.*preview/.test(cmd)) hard.push(`${app}: ignoreCommand no longer skips previews`);
    /* Vercel's own schema caps this at 256 characters, and it does not fail the
       way you would hope. The deployment does not fall back to building — it is
       rejected outright, "vercel.json schema validation failed", so EVERY deploy
       of that app stops including production. It cost one deployment here on
       2026-09-20, on a draft of this command that ran 300 characters, and
       nothing in CI reads Vercel's schema — the only reason it was caught is
       that someone happened to be watching a deployment at the time.
       The warn band exists because the failure is all-or-nothing and arrives
       with no approach: at 256 everything of that app's stops deploying, at 255
       everything is fine.
       It moved from 200 to 235 on 2026-09-20, when every command grew a
       FORCE_BUILD clause and the longest went 175 -> 218. Seven permanent warns
       would have been worse than no warn at all: a band nobody can clear is a
       band everybody learns to scroll past. The hard fail below is the real
       guard — it runs on every push and stops an over-long command reaching
       Vercel at all — so 235 is a nudge, which is why it can sit 17 above the
       new baseline and 21 below the cliff. */
    if (cmd.length > 256) hard.push(`${app}: ignoreCommand is ${cmd.length} characters — Vercel's limit is 256, and over it EVERY deploy of this app is rejected, production included`);
    else if (cmd.length > 235) soft.push(`${app}: ignoreCommand is ${cmd.length} of Vercel's 256 characters`);
    if (watchedBy(app).kind === "always") continue; // no diff: builds every production merge
    const named = [...cmd.matchAll(/apps\/([A-Za-z0-9._-]+)/g)].map((m) => m[1]);
    if (!named.includes(app)) hard.push(`${app}: ignoreCommand watches no path under apps/${app}`);
    const foreign = named.filter((n) => n !== app && APPS.includes(n));
    if (foreign.length) hard.push(`${app}: ignoreCommand watches ${foreign.map((f) => "apps/" + f).join(", ")}, not its own folder — it would never deploy again`);
  }
  add("each app's build is scoped to its own folder",
    hard.length ? "fail" : soft.length ? "warn" : "ok",
    hard.length ? hard.join("; ")
      : soft.length ? soft.join("; ")
        : (() => {
            const always = APPS.filter((a) => watchedBy(a).kind === "always");
            return `${APPS.length - always.length} apps skip a merge that does not touch them` +
              (always.length ? `; ${always.join(", ")} builds every production merge` : "");
          })());
}

/* ── Each ignoreCommand, RUN rather than read ─────────────────────────────
   The check above reads the folder names in a command. It cannot see the two
   one-line edits that stop an app deploying just as surely: dropping the
   `cd "$(git rev-parse --show-toplevel)"` (Vercel runs the step from the Root
   Directory, so `apps/coffee` then resolves to apps/coffee/apps/coffee and
   never differs), or swapping the exits after `||`. Both passed drift and CI;
   CI's own scope step runs from the repo root and cannot notice either.

   So each command is executed the way Vercel executes it: `sh -c`, from
   apps/<app>, VERCEL_ENV set, FORCE_BUILD unset — in a throwaway git repo that
   mirrors the paths the commands watch. Exit 1 builds and exit 0 skips, so a
   production merge touching the app must exit 1, one touching only another app
   must exit 0 (a command with no `git diff`, the hub's, must build every
   production merge instead), one touching packages/ must build every app,
   and every command must skip a preview. No git or sh to run it with is a
   warn with the reason, never an ok. */
{
  const name = "each ignoreCommand, run: builds its app, skips others";
  const cmds = [];
  for (const app of APPS) {
    let cfg = null;
    try { cfg = JSON.parse(read(R("apps", app, "vercel.json")) ?? "null"); } catch { /* reported above */ }
    if (typeof cfg?.ignoreCommand === "string") cmds.push([app, cfg.ignoreCommand]);
  }
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([k]) => k !== "FORCE_BUILD" && k !== "VERCEL_ENV" && !k.startsWith("GIT_")));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" });
  const probe = (bin, args) => { const r = spawnSync(bin, args, { env, encoding: "utf8" }); return !r.error && r.status === 0; };

  if (cmds.length === 0) add(name, "warn", "no app has an ignoreCommand to run");
  else if (!probe("git", ["--version"])) add(name, "warn", "git is not available here, so no command could be run — not measured");
  else if (!probe("sh", ["-c", "exit 0"])) add(name, "warn", "sh is not available here, so no command could be run — not measured");
  else {
    let tmp = null;
    const bad = [];
    try {
      tmp = mkdtempSync(join(tmpdir(), "drift-ignore-"));
      const g = (...args) => {
        const r = spawnSync("git", ["-c", "user.name=drift", "-c", "user.email=drift@localhost",
          "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args], { cwd: tmp, env, encoding: "utf8" });
        if (r.status !== 0) throw new Error(`git ${args[0]}: ${(r.stderr || r.error?.message || "").trim()}`);
      };
      const probeFile = (dir) => join(tmp, dir, ".drift-probe");
      let n = 0;
      const commit = (dir) => { writeFileSync(probeFile(dir), `${++n}\n`); g("add", "-A"); g("commit", "-q", "-m", `touch ${dir}`); };
      g("init", "-q");
      for (const dir of [...APPS.map((a) => `apps/${a}`), "packages"]) {
        mkdirSync(join(tmp, dir), { recursive: true });
        writeFileSync(probeFile(dir), "0\n");
      }
      g("add", "-A"); g("commit", "-q", "-m", "base");

      const run = (app, cmd, vercelEnv) => {
        const r = spawnSync("sh", ["-c", cmd], { cwd: join(tmp, "apps", app), encoding: "utf8", timeout: 10000,
          env: { ...env, VERCEL_ENV: vercelEnv } });
        return r.error ? `error (${r.error.code ?? r.error.message})` : r.status;
      };
      const expect = (app, cmd, vercelEnv, want, when, consequence) => {
        const got = run(app, cmd, vercelEnv);
        if (got !== want) bad.push(`${app}: ${when} it exits ${got}, not ${want} (${want === 1 ? "build" : "skip"}) — ${consequence}`);
      };
      const scoped = (cmd) => /\bgit\s+diff\b/.test(cmd);

      const NEVER_LIVE = "Vercel would skip it too, so the change would silently never go live";
      cmds.forEach(([app, cmd], i) => {
        commit(`apps/${app}`);
        expect(app, cmd, "production", 1, `on a production merge touching apps/${app}`, NEVER_LIVE);
        const [other, otherCmd] = cmds[(i + 1) % cmds.length];
        if (other !== app) {
          if (scoped(otherCmd)) expect(other, otherCmd, "production", 0, `on a production merge touching only apps/${app}`,
            "it rebuilds on merges that are not its own, and the last build to finish is the one Vercel serves");
          else expect(other, otherCmd, "production", 1, `on a production merge touching only apps/${app}`,
            "a command with no git diff has to build every production merge, and this one misses some");
        }
      });
      commit("packages");
      for (const [app, cmd] of cmds) expect(app, cmd, "production", 1, "on a production merge touching packages/",
        "packages/shared is stamped into every app, so a change there has to rebuild it");
      for (const [app, cmd] of cmds) expect(app, cmd, "preview", 0, "on a preview", "previews are ruled out, and this would build them");
    } catch (e) {
      add(name, "warn", `could not build the throwaway repo to run the commands in — not measured: ${e.message}`);
      tmp && rmSync(tmp, { recursive: true, force: true });
      tmp = false;
    }
    if (tmp !== false) {
      tmp && rmSync(tmp, { recursive: true, force: true });
      const always = cmds.filter(([, c]) => !/\bgit\s+diff\b/.test(c)).map(([a]) => a);
      add(name, bad.length ? "fail" : "ok",
        bad.length ? bad.join("; ")
          : `${cmds.length} commands run as Vercel runs them: each builds its own folder and packages/, skips a preview` +
            (cmds.length - always.length ? `, and ${cmds.length - always.length} skip another app's merge` : "") +
            (always.length ? `; ${always.join(", ")} builds every production merge` : ""));
    }
  }
}

/* ── A build that reads a path it does not watch stops rebuilding ─────────
   The #145 class. An app whose build reads a file outside its own folder, but
   whose ignoreCommand does not diff that file, skips every merge that changes
   only the file — and keeps serving what it read last, with nothing red.
   The hub did exactly this with `.claude` (#145), and after that fix still did
   it with every other app's folder, ci.yml, supabase and drift-check.mjs,
   which is why it now has no diff at all (TEC-10).

   What a build reads is derived by scripts/build-scope.mjs, statically and
   cut short wherever an argument is not a literal — so it over-reads rather
   than under-reads. What it cannot see is written there. The same file is
   what CI calls to decide its own build scope, so the second half of this
   check is that CI still calls it, and that every vercel.json still parses:
   CI fails OPEN on one that does not, which is safe but no longer scoped. */
{
  const hard = [], notes = [];
  for (const app of APPS) {
    const w = watchedBy(app);
    if (w.kind === "unparseable") { hard.push(`${app}: CI cannot read its scope — ${w.why}`); continue; }
    const reads = buildReads(app);
    if (w.kind === "always") { if (reads.length) notes.push(`${app} builds every merge (reads ${reads.length} paths outside its folder)`); continue; }
    const missed = reads.filter((r) => !covers(w, r));
    if (missed.length) hard.push(`${app}: build reads ${missed.map((r) => r || "the repo root").join(", ")} but its ignoreCommand watches only ${w.paths.join(" ")} — it will silently stop rebuilding`);
  }
  const ci = read(R(".github/workflows/ci.yml"));
  if (ci === null) hard.push("ci.yml not readable");
  else if (!ci.includes("scripts/build-scope.mjs")) hard.push("CI no longer reads its build scope from vercel.json via scripts/build-scope.mjs — it can miss what an ignoreCommand watches");
  add("every build watches what it reads",
    hard.length ? "fail" : "ok",
    hard.length ? hard.join("; ")
      : `${APPS.length} apps; CI scopes from vercel.json` + (notes.length ? `; ${notes.join("; ")}` : ""));
}

/* 4 ── Budgets. CI fails the breach; this reports the approach, because a file
   that arrives at its ceiling has already stopped being rewritten. */
{
  const budgets = [
    ...APPS.length ? [] : [],
    // ENUMERATED, not hardcoded — same reasoning as the staleness check below: a new
    // agent must arrive already budgeted rather than silently unmeasured.
    ...readdirSync(R(".claude/agents")).filter((d) => existsSync(R(".claude/agents", d, "HANDOFF.md")))
      .map((d) => [`.claude/agents/${d}/HANDOFF.md`, 80]),
    ...readdirSync(R(".claude/agents")).filter((d) => existsSync(R(".claude/agents", d, "RULES.md")))
      .map((d) => [`.claude/agents/${d}/RULES.md`, 350]),
    [".claude/DECISIONS.md", 400],
    // Tier 1 — auto-loaded into every session of every agent, so every line is paid
    // again forever. 400 was the target the compaction set; the file landed well
    // under it, so the ratchet came down to it with the ledger's retirement.
    // Raised to 450 on 2026-09-25 at Joel's call ("expand cap to 450"): #206 left the
    // file at 398, and the next rule (TEC-45, what a Linear status means and when
    // Joel is assigned) binds every agent, so it belongs here rather than in a charter.
    // Raised in its own change, not the one that fills it.
    ["CLAUDE.md", 450],
    // Read on demand rather than auto-loaded. Budgeted against growth, deliberately
    // loose: this tier is where reasoning goes when it leaves CLAUDE.md, so squeezing
    // it would defeat the compaction it exists to receive.
    [".claude/agents/KICKOFF.md", 220],
    [".claude/agents/STANDUP.md", 110],
    [".claude/SURFACE.md", 120],
    // Raised from 200 on 2026-09-23 (TEC-9), at Joel's call: the shared.contacts write
    // contract is ~35 lines of rules that each carry a caveat, the file sat at 191, and
    // squeezing the contract into 9 lines would have cut the caveats. Raised in its own
    // change, not the one that fills it.
    ["supabase/README.md", 240],
  ];
  for (const [rel, ceiling] of budgets) {
    const n = lines(R(rel));
    if (n === null) { add(`budget: ${rel}`, "warn", "missing"); continue; }
    // CLAUDE.md: "warns ten lines out and fails past the ceiling" — so a file
    // exactly ten lines under its ceiling already warns.
    add(`budget: ${rel}`, n > ceiling ? "fail" : n >= ceiling - 10 ? "warn" : "ok", `${n} / ${ceiling}`);
  }
}

/* 5 ── Handoff staleness, measured rather than asserted. A handoff dated before
   the newest commit in its own area is describing a repo that has moved.

   The agent list is ENUMERATED, not hardcoded. The first version of this file
   named five agents, which is the same bug it was written to catch: a new agent
   would not have failed the check, it would simply never have been checked.
   Most agents own the app that shares their name; the two that do not are named
   below, and an agent matching neither is reported as unmapped rather than
   skipped in silence. */
{
  /* Agents whose folder name does not match the app folder they own, and the
     reason this is a LIST rather than a string: on 2026-09-19 Joel retired the
     Pipeline Tracker and Message Editor agents; `apps/tracker` went to TechPad
     Gen, who already owned `apps/home`, and the frozen `apps/editor` went to
     the TD. One agent owns two apps and the TD owns one for the first time. A
     one-to-one map could not say that — it would have reported `apps/tracker` as an orphan while the
     charter plainly named an owner, which is the documentation and the disk
     disagreeing in the direction this file exists to catch.

     The TD's list is more than `apps/editor` because that app is FROZEN: dated
     against it alone, the TD's handoff read `ok` forever while two merges went
     by. `scripts` is the drift and stamping machinery this seat owns and
     nobody else edits. `.github` — CI and the pull-request checks — went to
     Deployment with the gate on 2026-09-24, and Deployment owns no app, so
     without it here its handoff could never be dated. `supabase/` is
     deliberately left out — app agents author their own migrations. */
  const NAMED = {
    "techpad-gen": ["apps/home", "apps/tracker"],
    "td": ["apps/editor", "scripts"],
    "deployment": [".github"],
  };
  const agents = existsSync(R(".claude/agents"))
    ? readdirSync(R(".claude/agents")).filter((d) => statSync(R(".claude/agents", d)).isDirectory()).sort()
    : [];

  for (const agent of agents) {
    const f = R(".claude/agents", agent, "HANDOFF.md");
    const body = read(f);
    if (!body) { add(`fresh: ${agent}`, "warn", "no HANDOFF.md — the Pit Wall lists an agent by that file"); continue; }

    const stated = body.match(/State as of (\d{4}-\d{2}-\d{2})/)?.[1];
    if (!stated) { add(`fresh: ${agent}`, "warn", "no 'State as of <date>' line — the Pit Wall reads that field"); continue; }

    const paths = NAMED[agent] ?? (APPS.includes(agent) ? [`apps/${agent}`] : []);
    if (!paths.length) {
      // An agent owning no folder has nothing to date it against. That is a
      // warn, never an ok: ok means measured, and this was not.
      add(`fresh: ${agent}`, "warn", `${stated}; owns no folder this check can date it against — not measured`);
      continue;
    }

    // Deployment config and env templates are swept by cross-cutting changes
    // that the owning agent did not write: #108 touched every vercel.json and
    // flagged three agents stale for one line each. Freshness is meant to ask
    // "has this handoff kept up with this app's code", so it measures the code.
    //
    // Every stamped copy is swept for the same reason, and the list is DERIVED
    // from the manifest rather than restated: a stamped file is by definition
    // one no app agent writes. Restating it as a literal is how this recurred
    // — folding ThemeControl.tsx into packages/shared flagged health, resume
    // and editor stale for a banner none of them wrote. Deriving it means the
    // next manifest entry is swept by existing, with nobody having to remember.
    const SWEPT = ["vercel.json", ".env.example", "package-lock.json",
                   ...MANIFEST.map((m) => m.to)];
    /* An agent owning several apps is as stale as its most recently changed
       one, so this takes the newest date across all of them and names which. */
    const dated = paths
      .map((path) => [path, git("log", "-1", "--format=%ad", "--date=short", "--", path,
        ...SWEPT.map((f) => `:(exclude)${path}/${f}`))])
      .filter(([, d]) => d)
      .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
    const label = paths.join(" + ");
    if (!dated.length) add(`fresh: ${agent}`, "warn", `stated ${stated}; no commits found under ${label}`);
    else {
      const [newestPath, newest] = dated[dated.length - 1];
      add(`fresh: ${agent}`, stated >= newest ? "ok" : "warn",
        stated >= newest ? `${stated}, current with ${label}`
          : `says ${stated}; ${newestPath} last changed ${newest}`);
    }
  }

  /* An app with no agent is nobody's, and an agent's app that has been
     deprecated leaves a charter describing a folder that is gone. Both are the
     roster changing underneath the documentation, which is the thing this file
     exists to notice. */
  const owned = new Set(Object.values(NAMED).flat().map((p) => p.replace("apps/", "")).concat(agents));
  const orphans = APPS.filter((a) => !owned.has(a));
  add("every app has an owning agent", orphans.length === 0 ? "ok" : "warn",
    orphans.length === 0 ? `${APPS.length} apps, all owned` : `no agent owns: ${orphans.join(", ")}`);
}

/* 6 ── Migration filenames named in prose, against the directory. Four were
   renamed on 2026-09-14 when the hosted API stamped its own versions, and the
   old names survived in instructions telling agents to copy a file that no
   longer existed. */
{
  const dir = R("supabase/migrations");
  const real = existsSync(dir) ? readdirSync(dir).map((f) => f.match(/^\d+/)?.[0]).filter(Boolean) : [];
  const WITHHELD = "20260908235234"; // remote-only on purpose — seven real contacts
  const docs = [];
  const walk = (d) => { for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (e === "node_modules" || e === ".git") continue;
    if (statSync(p).isDirectory()) walk(p); else if (e.endsWith(".md")) docs.push(p);
  } };
  walk(repoRoot);
  const bad = [];
  for (const d of docs) {
    for (const v of new Set(read(d).match(/\b202\d{11}\b/g) ?? [])) {
      if (v === WITHHELD || real.includes(v)) continue;
      bad.push(`${d.replace(repoRoot + "/", "")} → ${v}`);
    }
  }
  add("migration versions named in prose exist", bad.length === 0 ? "ok" : "warn",
    bad.length === 0 ? `${real.length} migrations, every reference resolves`
      : `names no file in supabase/migrations: ${bad.join("; ")}`);

  /* The same question of the apps' own code. A comment or error message citing
     a migration by version is an instruction to the next reader, and a version
     with no file behind it sends them looking for something that is not there.
     A warn naming the line: the app's own agent fixes the code, not this check.
     Generated files are skipped — drift.generated.ts carries this check's own
     output and would cite every version it reports. */
  const { files, how } = trackedFiles((f) => f.startsWith("apps/") && /\.tsx?$/.test(f) && !f.endsWith(".generated.ts"), ["apps"]);
  const cited = [];
  for (const f of files) {
    read(R(f))?.split("\n").forEach((line, i) => {
      for (const v of new Set(line.match(/\b202\d{11}\b/g) ?? []))
        if (v !== WITHHELD && !real.includes(v)) cited.push(`${f}:${i + 1} → ${v}`);
    });
  }
  add("migration versions cited in app code exist", cited.length === 0 ? "ok" : "warn",
    cited.length === 0 ? `${files.length} ${how} .ts/.tsx files under apps/, every cited version resolves`
      : `names no file in supabase/migrations: ${cited.join("; ")}`);
}

/* 7 ── Structures that were retired, staying retired. */
add("worklogs stay retired", existsSync(R(".claude/worklogs")) ? "fail" : "ok",
  existsSync(R(".claude/worklogs")) ? ".claude/worklogs/ is back — see the communication layer in CLAUDE.md" : "absent");
add("ledger stays retired", existsSync(R(".claude/OPEN-ITEMS.md")) ? "fail" : "ok",
  existsSync(R(".claude/OPEN-ITEMS.md")) ? ".claude/OPEN-ITEMS.md is back — open items live in Linear, team TEC" : "absent; open items are in Linear");

/* 8 ── Prose that should be computed. Not a failure — a count in a document is
   not wrong the day it is written. It is wrong later, which is why it is a
   warning naming where to look rather than an error.

   It reads every tracked .md except DECISIONS.md, which is history and says
   what was true when it was written. It used to read a hand-picked list, and
   the stale facts sat in the files it did not read: packages/shared/README.md
   said "all six apps" with seven on disk. Tables are no longer exempt from the
   test-count rule — a test count in a table cell goes stale exactly as fast. */
{
  const words = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const num = (w) => words[w.toLowerCase()] ?? Number(w);
  const { files: docs, how } = trackedFiles((f) => f.endsWith(".md") && f !== ".claude/DECISIONS.md", ["*.md"]);
  const hits = [];
  for (const rel of docs) {
    read(R(rel))?.split("\n").forEach((line, i) => {
      if (/^\s*>/.test(line)) return; // quotes carry examples
      if (/\b\d+\s+tests?\b/i.test(line)) { hits.push(`${rel}:${i + 1} names a test count`); return; }
      if (/^\s*\|/.test(line)) return; // tables carry examples for the rules below
      /* "the other four" — the rest of the roster, measured. CLAUDE.md said
         "rejects valid sessions on the other four" long after the roster grew,
         and no pattern here could see it: no noun after the number. Counted
         when nothing noun-like follows or the noun is a roster noun; "the other
         two agents" is about something else and is left alone. */
      const other = line.match(/\bthe other (two|three|four|five|six|seven|eight|nine|ten|\d+)\b(?:\s+(apps|tools|projects|Vercel projects|subdomains)\b|(?=\s*(?:[.,;:)!?—–-]|$)))/i);
      if (other && num(other[1]) >= 3 && num(other[1]) !== APPS.length - 1) {
        hits.push(`${rel}:${i + 1} says "the other ${other[1]}"; apps/ holds ${APPS.length}, so the rest is ${APPS.length - 1}`);
        return;
      }
      else if (/\b[0-9a-f]{7,40}\b/.test(line) && /commit|sha|serves|deployed/i.test(line)) hits.push(`${rel}:${i + 1} names a commit`);
      /* A ROSTER count — "all five apps", "the four tools", "in five projects".
         These go stale the day an app is added or deprecated, which now happens
         routinely, so they are claims with a shelf life.

         Two things are deliberately NOT matched, and the pattern is narrow on
         purpose rather than thorough. **A check that fires on good writing is
         one that gets routed around**, which costs more than the drift it
         catches — the same reason the hooks here stayed narrow.

         Not matched, first: counts describing a STRUCTURE rather than the
         roster. "three distinct versions" of middleware.ts, "three steps" to add
         a schema, "three things enforce". There the number is the content, and
         if it changed the rule should be re-read rather than quietly updated.

         Not matched, second: HISTORY. "used to be two agents", "six schema
         migrations that lived only in the database", "granted USAGE by naming
         four schemas". Those describe something that happened, and what happened
         does not drift.

         So the trigger is the shape of a present-tense claim about the whole
         set — `all N`, `the N`, `in N`, `across N` — not any number near a noun.

         That determiner was also the hole. `techpad-gen/RULES.md` read "five
         apps means five agents who will see it" and `platform/RULES.md` read
         "the five app agents": both are present-tense roster claims, both went
         stale the day Health landed, and neither has a determiner in front of
         the number, so this check reported `ok` through three separate
         re-measures of the ledger item that existed to find them.

         The second check below drops the determiner requirement, and pays for
         it twice over. First it narrows the noun: `apps`, `app agents` and
         `Vercel projects` name the app roster and nothing else, so a cardinal in
         front of one of them is about the roster whatever the surrounding
         grammar. The bare nouns from the first pattern — `agents`, `tools`,
         `copies` — stay out of it, because those appear in history and in
         structural counts that the determiner was excluding for free.

         Second, and this is the real difference: it MEASURES rather than
         flagging any written number. The first pattern has nothing to check
         itself against — there is no folder on disk holding the tools or the
         schemas — so it treats every written count as a shelf-life claim and
         says where to look. The app roster does have a folder, so this one
         compares against it and stays quiet while the document is right. A count
         that matches `apps/` today starts failing the day it stops matching,
         which is the whole point and is not something the first pattern can do.

         The floor at three is the one judgement call here, and it buys back the
         good writing the narrow noun would otherwise catch: "two apps' buttons
         sit inches apart on one screen" and "two apps share a livery" are claims
         about a PAIR, not about the whole set, and both are correct sentences
         this check would otherwise have fired on. A roster of two would be a
         deprecation event that gets read rather than quietly updated.

         `apps` left the first pattern on 2026-09-24: an app count is MEASURED
         by the second, so "all seven apps" is quiet while seven is true and
         "all six apps" warns the day it is not — rather than every correct
         app count warning forever for having a number in it. */
      if (/\b[0-9a-f]{7,40}\b/.test(line) && /commit|sha|serves|deployed/i.test(line)) hits.push(`${rel}:${i + 1} names a commit`);
      else if (/\b(all|the|in|across|on)\s+(all\s+)?(two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(projects|agents|tools|copies|schemas|subdomains|domains|tables)\b/i.test(line))
        hits.push(`${rel}:${i + 1} names a roster count`);
      else {
        const m = line.match(/\b(two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(apps|app agents|Vercel projects)\b/i);
        const n = m ? num(m[1]) : null;
        if (n !== null && n >= 3 && n !== APPS.length)
          hits.push(`${rel}:${i + 1} says "${m[1]} ${m[2]}"; apps/ holds ${APPS.length}`);
      }
    });
  }
  add("no computable facts written as prose", hits.length === 0 ? "ok" : "warn",
    hits.length === 0 ? `${docs.length} ${how} .md files: no test counts, commit SHAs or wrong app counts` : hits.join("; "));
}

/* ── Output ──────────────────────────────────────────────────────────────── */
const counts = { ok: 0, warn: 0, fail: 0 };
for (const c of checks) counts[c.state]++;

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ checks, counts }, null, 2));
  process.exit(0);
}

const mark = { ok: "  ok  ", warn: " warn ", fail: " FAIL " };
for (const c of checks) console.log(`${mark[c.state]}${c.name.padEnd(46)} ${c.detail}`);
console.log(`\n${counts.ok} ok · ${counts.warn} warn · ${counts.fail} fail`);
if (counts.fail) console.log("\nA fail means a rule in CLAUDE.md is now false. Fix the code or fix the rule — say which.");
process.exit(counts.fail ? 1 : 0);
