# Technical Director — handoff

State as of 2026-09-18.

Read `RULES.md` first for the role and the gate. This file is only what is true right now.

---

## In flight

**Two pull requests, open and green, waiting on Joel's word rather than on you.** This is the first
time this file has landed with work unmerged — previously the gate was the same session that wrote
them. `claude/platform-previews-off` turns preview deployments off; `claude/brief-tracker-paused`
records the tracker pause and tables it to Parked. **Check both live before assuming either state**:
they may have merged, or moved, since this sentence was written.

## What is true now

**Branch protection is on**, confirmed against the GitHub API. **`Require branches to be up to
date` is on**, which gives the merge-order rule teeth: after any merge every other pull request is
behind and must take `main` again. `Block force pushes` and `Restrict deletions` are also on.

**Standing up a new agent has a written protocol**, `.claude/agents/STANDUP.md`. **Solutioning is
not yours, and do not scaffold before it exists** — a folder name reaches DNS and a schema name
reaches the database, both settled by being typed. `drift`'s middleware check is roster-independent.

**The required checks are `gate`, `drift` and `requested-by-joel`** — switched 2026-09-16, each
bound to the GitHub Actions app rather than to any source. **No agent can read rulesets**, so that
is Joel's screenshot rather than a measurement; treat it as the best available and say so.

**Preview deployments are off**, as of 2026-09-18, through `ignoreCommand` in each app's
`vercel.json` rather than a dashboard setting — so it is in the repo and reviewable. **Read the test
before changing it.** It skips only an explicit `preview`, so production, development *and an unset*
`VERCEL_ENV` all build. Written the obvious way round it would skip production too whenever that
variable went missing, which is a change that merges and silently never goes live.

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
  back. One the TD writes is the TD's understanding of someone else's work, which is exactly the
  second-hand account these files exist to replace.
- **`DECISIONS.md` is append-only against a hard ceiling, and `drift` already warns on it.** There
  is no trimming rule for that file, so the wall arrives with no plan behind it. Read the live
  number from `drift` or The Garage, and raise it with Joel before the entry that will not fit.
- **Regenerating another agent's collector output ages their handoff.** `drift` dates freshness from
  `git log -- apps/<app>`, so your commit touching `apps/home/lib/*.generated.ts` makes TechPad Gen
  read stale. Warn only, clears on their next session — say so rather than letting them hunt.
- **You are a session, not a service.** You do not persist and you do not monitor. Tell Joel which
  mode is live rather than letting him assume the faster one.
- **The `supabase migration repair` hook matches the string in any Bash command**, including one
  that merely writes documentation naming it. Author such files with the Write tool. Do not
  obfuscate the string to get a Bash command through — that is routing around a hook.

## Next

**`packages/shared` is yours, not Joel's to approve** — item 8 has the shape. **Not npm workspaces**:
a root install costs the per-app independence the CI matrix rests on.

**Health is merged**, unreachable until Joel's four steps — item 2. **Step (a) is also the only
thing still paying for preview builds**: Vercel cannot see `apps/health/vercel.json` from the root.

**App surface is yours and the guide is unwritten** — item 13. The mockups that settled the look are
a canvas artifact, not in the repo, so the guide must carry the rules in words.

**Every agent has a board, URLs in `KICKOFF.md`** — the only place they live, so an agent that loses
its URL publishes a duplicate. **You are the rollup**; they report themselves. **`On track` is item
6**, and the deploy trigger is still its unsolved half.

Everything else waiting is in the ledger, which the `SessionStart` hook prints for you.
