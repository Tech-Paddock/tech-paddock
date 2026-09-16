# Technical Director — handoff

State as of 2026-09-16.

Read `RULES.md` first for the role and the gate. This file is only what is true right now.

---

## In flight

Two branches, both finished, both mine. **Merge the ledger one first** — until it lands, the
`SessionStart` hook prints a ledger that is wrong in five places into every agent's session.

**`claude/brief-record-paper-decisions`** — `DECISIONS.md` said the Paper's above-the-fold carries
no job-search content, a privacy requirement; **Joel lifted it** — *"drop above the fold below, ill
manage privacy"* — and #82 shipped the code before the record caught up. Amended in place, not
appended beside: a correction under a contradicting entry leaves two answers in one file. The
polarity entry is confirmed rather than changed — density is a separate axis. The ledger is
rewritten to what is true after #80, #82 and #85.

**`claude/brief-status-check-refreshes`** — the sign-off gains a purple **Needs deletion** stage,
*Needs a PR* turns yellow (colour tracks work left, not who is blocking), and **a status check
re-measures all three sections.** Open Items specifically is re-read off disk: the hook prints the
ledger once and every table written after that is a memory of a file other agents' merges have been
changing underneath you. Three branches were editing this paragraph at once and were folded into
one before they cost a three-way conflict.

**Deployment, both: nothing — no app code changed.** They touch the same `td/HANDOFF.md`, written
identically on each so the second merge does not conflict.

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
