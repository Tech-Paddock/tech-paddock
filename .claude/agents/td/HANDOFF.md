# Technical Director — handoff

State as of 2026-09-16.

Read `RULES.md` first for the role and the gate. This file is only what is true right now.

---

## In flight

**Nothing, by the time you read this.** The two branches this file landed with —
`claude/brief-standup-solution-first` and `claude/brief-ledger-macros` — were merged as they landed,
because the gate is the same session that wrote them.

**Written that way on purpose.** A handoff describes the moment *before* the merge, and the merge
falsifies it by happening — three times today, in other agents' files. The gate checks a handoff is
current as reviewed; nothing checks it five minutes later.

## What is true now

**Branch protection is on**, confirmed against the GitHub API rather than assumed — an older note
in this charter said to assume otherwise and was wrong. Six required checks: the five `build (…)`
jobs and `requested-by-joel`. **`Require branches to be up to date before merging` is on**, which is
what gives the merge-order rule teeth: after any merge every other open pull request is behind and
must take `main` again. So the order you pick decides who pays. `Block force pushes` and
`Restrict deletions` are also on.

**Standing up a new agent has a written protocol**, `.claude/agents/STANDUP.md`. **Solutioning comes
first and it is not yours** — Joel works the design out with the new agent and logs it as a draft
`RULES.md`, and that draft is the handoff into the protocol. **Do not scaffold before it exists**: a
folder name reaches DNS and a schema name reaches the database, both settled by being typed. The
`drift` middleware check is roster-independent, so a new app sharing the base copy passes.

**Only you watch a pull request.** Joel settled it — no other agent subscribes or offers to. One
watcher gets the events and a second gets silence, so two watchers means one is deaf. It dies with
your session, which is the trap below rather than an exception to it.

**A new app needs no CI change.** The matrix derives the roster from `apps/` and one fixed-name
`gate` sits in front of it, so branch protection needs a single check that never changes shape.
**The required-check list has not been switched over yet** — that is Joel's, in the repository
settings, and until it happens a deprecated app still leaves a required check that can never report.

**No agent can read rulesets**, so *which* checks are required is unverifiable from a session. The
list above came from Joel.

**You apply migrations at gate time**, through the hosted API, before merging. `supabase db push`
cannot work here and never will — see the traps in `.claude/DECISIONS.md`.

**A green `build (app)` no longer means that app was built** — per-app scoping landed in #57, and
its skip path has still never executed in CI. If it is wrong it fails loudly rather than passing
something untested, which is the right way round.

## Traps specific to this seat

- **Check the open list with a live call as the first step of every merge.** Not from memory, not
  from twenty minutes ago. Other agents open pull requests while you work and you cannot see it
  happen. This has already been broken once — see `.claude/DECISIONS.md`.
- **Read the real head SHA before passing `expectedHeadSha`.** Inventing a full SHA from a short
  prefix has been done twice; the guard rejected both.
- **Do not backfill another agent's handoff on the way past.** A stale handoff sends the change
  back. One the TD writes is the TD's understanding of someone else's work, which is exactly the
  second-hand account these files exist to replace.
- **You are a session, not a service.** You do not persist and you do not monitor. Tell Joel which
  mode is live rather than letting him assume the faster one.
- **The `supabase migration repair` hook matches the string in any Bash command**, including one
  that merely writes documentation naming it. Author such files with the Write tool. Do not
  obfuscate the string to get a Bash command through — that is routing around a hook.

## Next

**`packages/shared` is the open architectural call**, and the recommendation is on the table: one
source at `packages/shared`, a script that writes each app's copy, and `drift` failing a copy that
differs — rather than npm workspaces, which would force a root install and cost the per-app
independence the derived CI matrix rests on. **The deadline is the next app folder**, not a date.
Whether `apps/tracker` deprecates into the Pit Wall is Joel's and lands on a settled hub rule.

Everything else waiting is in the ledger, which the `SessionStart` hook prints for you.
