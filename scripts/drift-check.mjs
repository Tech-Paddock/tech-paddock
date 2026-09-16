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
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

/* 1 ── Files the rules call byte-identical across every app.
   A mismatch in the auth pair does not throw; it silently rejects valid
   sessions on the other four, which looks like a login bug rather than a
   config one. theme.css drifts loudly by comparison, but it is still one more
   file that has to be edited five times. */
for (const rel of ["lib/auth.ts", "lib/password.ts", "lib/theme.css"]) {
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

/* 2 ── middleware.ts is THREE deliberate variants, not five identical copies.
   home/resume/coffee share one, editor adds /api/draft, tracker adds
   /api/summary and waves /api/cron/* through. An agent who checks, finds three
   and concludes the rule is wrong has been handed that conclusion by the rule
   itself — so measure the shape, not just the count. */
{
  const present = APPS.map((a) => [a, md5(R("apps", a, "middleware.ts"))]).filter(([, h]) => h);
  const groups = new Map();
  for (const [a, h] of present) groups.set(h, [...(groups.get(h) ?? []), a]);
  const shape = [...groups.values()].map((g) => g.sort().join("+")).sort();
  const expected = ["coffee+home+resume", "editor", "tracker"].sort();
  const same = shape.length === expected.length && shape.every((g, i) => g === expected[i]);
  add("middleware.ts: three deliberate variants", same ? "ok" : "fail",
    same ? shape.join(" | ") : `expected ${expected.join(" | ")} — measured ${shape.join(" | ")}`);
}

/* 3 ── The CI matrix is hardcoded. An app missing from it is not failed, it is
   never run at all, which is the silent half. */
{
  const ci = read(R(".github/workflows/ci.yml"));
  const m = ci?.match(/app:\s*\[([^\]]+)\]/);
  const matrix = m ? m[1].split(",").map((s) => s.trim()).filter(Boolean).sort() : null;
  if (!matrix) add("CI matrix covers every app", "warn", "could not read the matrix from ci.yml");
  else {
    const missing = APPS.filter((a) => !matrix.includes(a));
    add("CI matrix covers every app", missing.length === 0 ? "ok" : "fail",
      missing.length === 0 ? `${matrix.length} apps, all in the matrix`
        : `untested and silent about it: ${missing.join(", ")}`);
  }
}

/* 4 ── Budgets. CI fails the breach; this reports the approach, because a file
   that arrives at its ceiling has already stopped being rewritten. */
{
  const budgets = [
    ...APPS.length ? [] : [],
    ...readdirSync(R(".claude/agents")).filter((d) => existsSync(R(".claude/agents", d, "HANDOFF.md")))
      .map((d) => [`.claude/agents/${d}/HANDOFF.md`, 80]),
    [".claude/OPEN-ITEMS.md", 80],
    [".claude/DECISIONS.md", 200],
  ];
  for (const [rel, ceiling] of budgets) {
    const n = lines(R(rel));
    if (n === null) { add(`budget: ${rel}`, "warn", "missing"); continue; }
    add(`budget: ${rel}`, n > ceiling ? "fail" : n > ceiling - 10 ? "warn" : "ok", `${n} / ${ceiling}`);
  }
}

/* 5 ── Handoff staleness, measured rather than asserted. A handoff dated before
   the newest commit in its own area is describing a repo that has moved. */
{
  const areas = { "techpad-gen": "apps/home", "message-editor": "apps/editor", tracker: "apps/tracker", resume: "apps/resume", coffee: "apps/coffee" };
  for (const [agent, path] of Object.entries(areas)) {
    const f = R(".claude/agents", agent, "HANDOFF.md");
    const body = read(f);
    if (!body) { add(`fresh: ${agent}/HANDOFF.md`, "warn", "missing"); continue; }
    const stated = body.match(/State as of (\d{4}-\d{2}-\d{2})/)?.[1];
    const newest = git("log", "-1", "--format=%ad", "--date=short", "--", path);
    if (!stated) add(`fresh: ${agent}/HANDOFF.md`, "warn", "no 'State as of <date>' line — the Pit Wall reads that field");
    else if (!newest) add(`fresh: ${agent}/HANDOFF.md`, "warn", `stated ${stated}; no commits found under ${path}`);
    else add(`fresh: ${agent}/HANDOFF.md`, stated >= newest ? "ok" : "warn",
      stated >= newest ? `${stated}, current with ${path}` : `says ${stated}; ${path} last changed ${newest}`);
  }
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
}

/* 7 ── Structures that were retired, staying retired. */
add("worklogs stay retired", existsSync(R(".claude/worklogs")) ? "fail" : "ok",
  existsSync(R(".claude/worklogs")) ? ".claude/worklogs/ is back — see the communication layer in CLAUDE.md" : "absent");
{
  const l = read(R(".claude/OPEN-ITEMS.md"));
  const done = l !== null && /^#+ *done/im.test(l);
  add("ledger carries no Done archive", done ? "fail" : "ok",
    done ? "a 'Done' heading is how it reached 588 lines last time" : "open items only");
}

/* 8 ── Prose that should be computed. Not a failure — a count in a document is
   not wrong the day it is written. It is wrong later, which is why it is a
   warning naming where to look rather than an error. */
{
  const docs = [R("CLAUDE.md"), R("README.md"), R("supabase/README.md"),
    ...readdirSync(R(".claude/agents")).flatMap((d) => ["RULES.md", "HANDOFF.md"]
      .map((f) => R(".claude/agents", d, f))).filter(existsSync)];
  const hits = [];
  for (const d of docs) {
    const rel = d.replace(repoRoot + "/", "");
    read(d).split("\n").forEach((line, i) => {
      if (/^\s*[|>]/.test(line)) return; // tables and quotes carry examples
      if (/\b\d+\s+tests?\b/i.test(line)) hits.push(`${rel}:${i + 1} names a test count`);
      else if (/\b[0-9a-f]{7,40}\b/.test(line) && /commit|sha|serves|deployed/i.test(line)) hits.push(`${rel}:${i + 1} names a commit`);
    });
  }
  add("no computable facts written as prose", hits.length === 0 ? "ok" : "warn",
    hits.length === 0 ? "no test counts or commit SHAs in prose" : hits.join("; "));
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
