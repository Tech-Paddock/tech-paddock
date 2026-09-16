# Technical Director — handoff

State as of 2026-09-16.

Read `RULES.md` first for the role and the gate. This file is only what is true right now.

---

## In flight

Two branches of mine, both finished, both behind #79 / #80 / #81 in the queue at Joel's direction.

**`claude/brief-agent-standup-protocol`** — the rails for standing up a new agent. Adds
`.claude/agents/STANDUP.md`, the protocol to open and execute when Joel wants one, and points this
charter at it. Also rewrites the `drift` middleware check so it is roster-independent:
**it used to fail a correct sixth app**, because the base group was hardcoded as
`coffee+home+resume`. It now asserts a base copy plus editor's and tracker's scoped bypasses, and
was exercised against four roster shapes rather than reasoned about.

**`claude/brief-three-part-footer`** — the sign-off every agent ends a message with is now three
sections: Work Brief, DevOps, Open Items. DevOps is the promotion pipeline in four stages named in
Joel's words — in progress, needs a PR, ready to merge, stuck — because committed-versus-uncommitted
is how an agent saves work, not a stage of getting something live.
**The scoping is the part to preserve:** you report every pushed branch and every ledger row; every
other agent reports only its own. **You cannot see another agent's in-progress work** — it never
reaches the repo until it is pushed — so it appears only in its author's section. Approved by Joel
on 2026-09-16 and dialled in over three rounds of his feedback.

**Deployment, both: nothing — no app code changed.** They touch the same `td/HANDOFF.md`, so
whichever merges second pays a conflict. That is yours, not the author's.

## What is true now

**Branch protection is on**, confirmed against the GitHub API rather than assumed — an older note
in this charter said to assume otherwise and was wrong. Six required checks: the five `build (…)`
jobs and `requested-by-joel`. **`Require branches to be up to date before merging` is on**, which is
what gives the merge-order rule teeth: after any merge every other open pull request is behind and
must take `main` again. So the order you pick decides who pays. `Block force pushes` and
`Restrict deletions` are also on.

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
