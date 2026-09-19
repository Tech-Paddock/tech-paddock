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
   file that has to be edited five times.

   next.config.mjs joined the list on 2026-09-19. It carries the security
   headers, and it is the one file here where drift is silent by construction:
   a missing header changes nothing anybody can see. apps/home had shipped with
   an empty config and no frame-ancestors for as long as the file existed, and
   nothing said so until somebody read all six. */
for (const rel of ["lib/auth.ts", "lib/password.ts", "lib/theme.css", "next.config.mjs"]) {
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

/* 3 ── CI builds whatever is on disk, and one fixed name gates it.
   A hardcoded matrix does not fail when an app is missing from it — the app is
   simply never built. A per-app required-check list has the same shape of
   problem from the other side: deprecating an app leaves a required check that
   can never report. Both are fixed by deriving the roster and putting one
   stable job in front, so this checks that neither has been undone. */
{
  const ci = read(R(".github/workflows/ci.yml"));
  if (!ci) add("CI derives its roster from apps/", "warn", "ci.yml not readable");
  else {
    const literal = ci.match(/app:\s*\[([^\]]+)\]/);
    if (literal) {
      const matrix = literal[1].split(",").map((s) => s.trim()).filter(Boolean);
      const missing = APPS.filter((a) => !matrix.includes(a));
      add("CI derives its roster from apps/", missing.length === 0 ? "warn" : "fail",
        missing.length === 0
          ? "matrix is hardcoded again — it matches today, but a new app will be skipped in silence"
          : `matrix is hardcoded AND already wrong — untested: ${missing.join(", ")}`);
    } else if (/app:\s*\$\{\{\s*fromJson\(/.test(ci)) {
      add("CI derives its roster from apps/", "ok", `derived — ${APPS.length} app folders will build`);
    } else {
      add("CI derives its roster from apps/", "fail", "no matrix found in ci.yml at all");
    }
    add("one stable gate in front of CI", /^\s{2}gate:/m.test(ci) ? "ok" : "fail",
      /^\s{2}gate:/m.test(ci) ? "gate job present — branch protection needs only that name"
        : "the gate job is gone; required checks are per-app again and break on every roster change");
  }
}

/* ── Each app's Vercel build is scoped to its own folder ──────────────────
   Until 2026-09-19 every `ignoreCommand` read "skip previews, build
   everything else", which cannot see which folder changed. One merge rebuilt
   all six apps, and since Vercel aliases whichever build finishes LAST rather
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

   `packages` rides in every pathspec deliberately, though it does not exist
   yet. `packages/shared` is ledger item 4, and the day it lands every app
   must rebuild when it changes. A pathspec naming a path git does not have is
   not an error — it simply matches nothing — so this costs nothing today and
   removes a step that would otherwise be discovered by an app going stale.

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
    const named = [...cmd.matchAll(/apps\/([A-Za-z0-9._-]+)/g)].map((m) => m[1]);
    if (!named.includes(app)) hard.push(`${app}: ignoreCommand watches no path under apps/${app}`);
    const foreign = named.filter((n) => n !== app && APPS.includes(n));
    if (foreign.length) hard.push(`${app}: ignoreCommand watches ${foreign.map((f) => "apps/" + f).join(", ")}, not its own folder — it would never deploy again`);
  }
  add("each app's build is scoped to its own folder",
    hard.length ? "fail" : soft.length ? "warn" : "ok",
    hard.length ? hard.join("; ")
      : soft.length ? soft.join("; ")
        : `${APPS.length} apps, each skipping a merge that does not touch it`);
}

/* 4 ── Budgets. CI fails the breach; this reports the approach, because a file
   that arrives at its ceiling has already stopped being rewritten. */
{
  const budgets = [
    ...APPS.length ? [] : [],
    ...readdirSync(R(".claude/agents")).filter((d) => existsSync(R(".claude/agents", d, "HANDOFF.md")))
      .map((d) => [`.claude/agents/${d}/HANDOFF.md`, 80]),
    [".claude/OPEN-ITEMS.md", 80],
    [".claude/DECISIONS.md", 260],
  ];
  for (const [rel, ceiling] of budgets) {
    const n = lines(R(rel));
    if (n === null) { add(`budget: ${rel}`, "warn", "missing"); continue; }
    add(`budget: ${rel}`, n > ceiling ? "fail" : n > ceiling - 10 ? "warn" : "ok", `${n} / ${ceiling}`);
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
  const NAMED = { "techpad-gen": "apps/home", "message-editor": "apps/editor" };
  const agents = existsSync(R(".claude/agents"))
    ? readdirSync(R(".claude/agents")).filter((d) => statSync(R(".claude/agents", d)).isDirectory()).sort()
    : [];

  for (const agent of agents) {
    const f = R(".claude/agents", agent, "HANDOFF.md");
    const body = read(f);
    if (!body) { add(`fresh: ${agent}`, "warn", "no HANDOFF.md — the Pit Wall lists an agent by that file"); continue; }

    const stated = body.match(/State as of (\d{4}-\d{2}-\d{2})/)?.[1];
    if (!stated) { add(`fresh: ${agent}`, "warn", "no 'State as of <date>' line — the Pit Wall reads that field"); continue; }

    const path = NAMED[agent] ?? (APPS.includes(agent) ? `apps/${agent}` : null);
    if (!path) {
      // td and platform own no folder, so there is nothing to date them
      // against. Say so rather than reporting ok for something unmeasured.
      add(`fresh: ${agent}`, "ok", `${stated}; owns no app folder, so freshness is not measurable here`);
      continue;
    }

    // Deployment config and env templates are swept by cross-cutting changes
    // that the owning agent did not write: #108 touched every vercel.json and
    // flagged three agents stale for one line each. Freshness is meant to ask
    // "has this handoff kept up with this app's code", so it measures the code.
    const SWEPT = ["vercel.json", ".env.example", "package-lock.json"];
    const newest = git("log", "-1", "--format=%ad", "--date=short", "--", path,
      ...SWEPT.map((f) => `:(exclude)${path}/${f}`));
    if (!newest) add(`fresh: ${agent}`, "warn", `stated ${stated}; no commits found under ${path}`);
    else add(`fresh: ${agent}`, stated >= newest ? "ok" : "warn",
      stated >= newest ? `${stated}, current with ${path}` : `says ${stated}; ${path} last changed ${newest}`);
  }

  /* An app with no agent is nobody's, and an agent's app that has been
     deprecated leaves a charter describing a folder that is gone. Both are the
     roster changing underneath the documentation, which is the thing this file
     exists to notice. */
  const owned = new Set(Object.values(NAMED).map((p) => p.replace("apps/", "")).concat(agents));
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
         deprecation event that gets read rather than quietly updated. */
      else if (/\b(all|the|in|across|on)\s+(all\s+)?(two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(apps|projects|agents|tools|copies|schemas|subdomains|domains|tables)\b/i.test(line))
        hits.push(`${rel}:${i + 1} names a roster count`);
      else {
        const words = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
        const m = line.match(/\b(two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(apps|app agents|Vercel projects)\b/i);
        const n = m ? (words[m[1].toLowerCase()] ?? Number(m[1])) : null;
        if (n !== null && n >= 3 && n !== APPS.length)
          hits.push(`${rel}:${i + 1} says "${m[1]} ${m[2]}"; apps/ holds ${APPS.length}`);
      }
    });
  }
  add("no computable facts written as prose", hits.length === 0 ? "ok" : "warn",
    hits.length === 0 ? "no test counts or commit SHAs in prose" : hits.join("; "));
}

/* ── Ledger numbers are permanent ─────────────────────────────────────────
   Numbers used to be positional: close an item and everything below shifted
   up on the next write. On 2026-09-19 that happened four times in one day and
   broke a parked row's cross-reference, three numbers in the TD's handoff, a
   DECISIONS.md entry, and live references in two agents' branches — every one
   of them pointing confidently at the wrong item rather than at nothing.

   So a number now belongs to its item for good. Closing one leaves a gap, and
   `Next number` in the ledger header is the high-water mark a new item takes.
   This fails rather than warns: a silently reused number is the exact failure
   the # column exists to prevent, and it is invisible in a diff. */
{
  const rel = ".claude/OPEN-ITEMS.md";
  const text = read(R(rel));
  if (text === null) {
    add("ledger numbers are permanent", "fail", `${rel} is missing`);
  } else {
    const declared = text.match(/\*\*Next number:\s*(\d+)\.?\*\*/);
    const nums = [...text.matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]));
    const problems = [];

    if (!declared) problems.push("header declares no `Next number:`");
    const next = declared ? Number(declared[1]) : null;

    const seen = new Set();
    for (const n of nums) {
      if (seen.has(n)) problems.push(`item ${n} appears twice`);
      seen.add(n);
    }
    /* Ascending is measured WITHIN a section, never across the file — and the
       difference is not cosmetic. The ledger groups by who is blocked (Blocking
       everything else, Waiting on Joel, Waiting on an agent, Parked), while a
       new item always takes the highest number there has ever been. Those two
       rules point opposite ways: item 15 arriving in `Waiting on Joel` sits
       above item 2 in `Waiting on an agent`, and a whole-file ascending rule
       calls that correct file a failure.

       It did. This check shipped on 2026-09-19 reading the file as one list, and
       the first item added under it — 15, the morning after — tripped it. A
       check that fails the next legitimate edit is worse than no check, because
       the way past it is to renumber, which is the exact thing it exists to
       stop. Within a section the rule still catches a row dropped in the wrong
       place, and the baseline comparison below is what actually catches a
       renumber. */
    let section = "(before any heading)";
    let prev = null;
    for (const line of text.split("\n")) {
      const h = line.match(/^## +(.+?)\s*$/);
      if (h) { section = h[1]; prev = null; continue; }
      const it = line.match(/^(\d+)\. \*\*/);
      if (!it) continue;
      const n = Number(it[1]);
      if (prev !== null && n <= prev) problems.push(`item ${n} follows ${prev} under "${section}"`);
      prev = n;
    }
    if (next !== null) {
      const over = nums.filter((n) => n >= next);
      if (over.length) problems.push(`${over.join(", ")} at or above Next number ${next} — bump the header when you add an item`);
    }

    /* The three rules above catch a duplicate, a missing header and a number
       reaching into reserved space. They do NOT catch the failure this check
       exists for: renumbering 1..N after a close produces a sequence that is
       ascending, unique and inside the header — and every reference to the
       items below the closed one is now wrong. The only way to see it is to
       compare against what the numbers were, so that is what this does. */
    const baseline = git("show", "origin/main:" + rel);
    const titles = (t) =>
      new Map([...t.matchAll(/^(\d+)\. \*\*(.+?)\*\*/gm)].map((m) => [m[2], Number(m[1])]));
    if (baseline) {
      const before = titles(baseline);
      const moved = [];
      for (const [title, n] of titles(text)) {
        const was = before.get(title);
        if (was !== undefined && was !== n) moved.push(`"${title.slice(0, 44)}" was ${was}, now ${n}`);
      }
      if (moved.length) problems.push(`items renumbered against origin/main: ${moved.join("; ")}`);
    }

    const checked = baseline ? "against origin/main" : "no origin/main to compare, numbering shape only";
    add("ledger numbers are permanent", problems.length === 0 ? "ok" : "fail",
      problems.length === 0
        ? `${nums.length} items, ascending, all below Next number ${next} — ${checked}`
        : problems.join("; "));
  }
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
