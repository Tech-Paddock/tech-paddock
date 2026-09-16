# Technical Director — handoff

State as of 2026-09-16.

Read `RULES.md` first for the role and the gate. This file is only what is true right now.

---

## In flight

**`claude/brief-three-part-footer`** — the sign-off every agent ends a message with is now three
sections: Work Brief, DevOps, Open Items. DevOps is the promotion pipeline in four stages named in
Joel's words — in progress, needs a PR, ready to merge, stuck — because committed-versus-uncommitted
is how an agent saves work, not a stage of getting something live. It also gives him three phrases
that mean three specific things: **close out**, **park it**, **pick up: X**.
**The scoping is the part to preserve:** you report every pushed branch and every ledger row; every
other agent reports only its own. **You cannot see another agent's in-progress work** — it never
reaches the repo until it is pushed — so it appears only in its author's section. Approved by Joel
on 2026-09-16 and dialled in over four rounds of his feedback.
**Deployment: nothing — no app code changed.**

Nothing else of mine is open.

## What is true now

**Branch protection is on**, confirmed against the GitHub API rather than assumed — an older note
in this charter said to assume otherwise and was wrong. Six required checks: the five `build (…)`
jobs and `requested-by-joel`. **`Require branches to be up to date before merging` is on**, which is
what gives the merge-order rule teeth: after any merge every other open pull request is behind and
must take `main` again. So the order you pick decides who pays. `Block force pushes` and
`Restrict deletions` are also on.

**Standing up a new agent has a written protocol**, `.claude/agents/STANDUP.md`, landed in #83.
Open and execute it when Joel asks for one; `RULES.md` says the same. The `drift` middleware check
is roster-independent as of the same pull request, so a sixth app sharing the base copy passes.

**A new app needs no CI change.** The matrix derives the roster from `apps/` and one fixed-name
`gate` sits in front of it, so branch protection needs a single check that never changes shape.
**The required-check list has not been switched over yet** — that is Joel's, in the repository
settings, and until it happens a deprecated app still leaves a required check that can never report.

**No agent can read rulesets**, so *which* checks are required is unverifiable from a session. The
list above came from Joel.

**You apply migrations at gate time**, through the hosted API, before merging. `supabase db push`
cannot work here and never will — see the traps in `.claude/DECISIONS.md`.

**A green `build (app)` no longer means that app was built.** Per-app scoping landed in #57. The
skip path still has not executed in CI: every commit on the branch that introduced it touched
`.github/workflows`, which is in scope for all five. If it is wrong it fails loudly rather than
passing something untested, which is the right way round.

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

Nothing queued. Four items wait on Joel and one is parked; they are in the ledger, which the
`SessionStart` hook prints for you.
