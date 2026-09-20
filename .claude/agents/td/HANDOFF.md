# Technical Director — handoff

State as of 2026-09-20.

Read `RULES.md` first for the role and the gate. This file is only what is true right now.

---

## In flight

**#152 is merged.** `packages/shared` is the one real copy of `auth.ts`, `password.ts`, `theme.css`,
`theme.ts` and `next.config.mjs`; `drift` fails a copy that disagrees. **Edit canonical, restamp.**

**This branch is #153**, the ledger. **Three more are mine and behind it**, each taking `main` in
turn because up-to-date is required: `brief-decisions-refile`, `platform-surface-guide`,
`platform-on-track-stage`. **Re-read `main` before trusting any of them.**

## What is true now

**The repository is public**, as of 2026-09-19 — which made Actions free and ended the minutes
outage. **`.claude/` is public reading now**: the charters, the ledger, every carve-out below.

**Postgres is yours; deliveries are TechPad Gen's** since 2026-09-19 — the database stayed because
migrations are applied at the gate. **You own the merge; they own what happens after it.**

**Branch protection is on**, confirmed against the GitHub API. **`Require branches to be up to
date` is on**, which gives the merge-order rule teeth: after any merge every other pull request is
behind and must take `main` again. `Block force pushes` and `Restrict deletions` are also on.

**Standing up a new agent has a written protocol**, `.claude/agents/STANDUP.md`. **Solutioning is
not yours, and do not scaffold before it exists** — a folder name reaches DNS and a schema name the
database, both settled by being typed. `drift`'s middleware check is roster-independent.

**The required checks are `gate`, `drift` and `requested-by-joel`** — switched 2026-09-16, each
bound to the GitHub Actions app rather than to any source. **No agent can read rulesets**, so that
is Joel's screenshot rather than a measurement; treat it as the best available and say so.

**Previews are off, and each app now builds only when its own folder changes** — both through
`ignoreCommand` in its `vercel.json`, in the repo rather than a dashboard. **Every failure mode
builds rather than skips**: unset `VERCEL_ENV`, a git error, a missing repo. A wrong skip merges and
silently never goes live, so `drift` fails a command naming another app's folder.

**You apply migrations at gate time**, through the hosted API, before merging. `supabase db push`
cannot work here and never will — see the traps in `.claude/DECISIONS.md`.

**A green `build (app)` no longer means that app was built** — per-app scoping landed in #57 and
its skip path has still never executed in CI. It fails loudly rather than passing something untested.

## Traps specific to this seat

- **Check the open list with a live call as the first step of every merge.** Not from memory, not
  from twenty minutes ago. Other agents open pull requests while you work and you cannot see it
  happen. This has already been broken once — see `.claude/DECISIONS.md`.
- **Read the real head SHA before passing `expectedHeadSha`.** Inventing a full SHA from a short
  prefix has been done twice; the guard rejected both.
- **Do not backfill another agent's handoff on the way past.** A stale handoff sends the change
  back; one the TD writes is the second-hand account these files exist to replace.
- **`DECISIONS.md` is AT its ceiling, 260/260, and three copies of that ceiling disagree.** Its
  trimming rule exists and has never once fired. Joel's call — raise or archive, never a squeeze.
- **`live: false` on a Vercel project does not mean paused.** Read deployment state — `BLOCKED` is
  paused, `READY` at `target: production` is not. This cost the ledger a false claim for a day.
- **Regenerating another agent's collector output ages their handoff.** `drift` dates freshness from
  `git log -- apps/<app>`, so your commit touching `apps/home/lib/*.generated.ts` makes TechPad Gen
  read stale. Warn only, clears on their next session — say so rather than letting them hunt.
- **You are a session, not a service.** You do not persist and you do not monitor. Tell Joel which
  mode is live rather than letting him assume the faster one.
- **The `supabase migration repair` hook matches the string in any Bash command**, including one
  that merely writes documentation naming it. Author such files with the Write tool. Do not
  obfuscate the string to get a Bash command through — that is routing around a hook.

## Next

**Item 4 is done and item 1 is now one edit** — `packages/shared/lib/auth.ts`, stamp, done.
**Surface is yours and unwritten** — item 7, mockups in a canvas artifact, so the guide carries the
rules in words. **#151 is superseded: the Cookbook is its own app, and `STANDUP.md` step 1 is Joel's.**

**Every agent has a board, URLs in `KICKOFF.md`** — the only place they live, so an agent that loses
its URL publishes a duplicate. **You are the rollup.** Joel, 2026-09-19: **a merge refreshes the
merged agent's board too** — not in `CLAUDE.md` yet. **Their DevOps row and a dated TD banner only**;
their Brief and Items stay theirs. **`On track` is item 3**, deploy trigger still unsolved.
