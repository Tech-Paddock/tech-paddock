# Technical Director — handoff

State as of 2026-09-16.

Read `RULES.md` first for the role and the gate. This file is only what is true right now.

---

## In flight

**Nothing, by the time you read this** — every branch this file landed with was merged as it landed,
because the gate is the same session that wrote them. **Written that way on purpose:** a handoff
describes the moment *before* the merge, and the merge falsifies it by happening.

## What is true now

**Branch protection is on**, confirmed against the GitHub API rather than assumed. **`Require
branches to be up to date` is on**, which is what gives the merge-order rule teeth: after any merge
every other pull request is behind and must take `main` again, so the order you pick decides who
pays. `Block force pushes` and `Restrict deletions` are also on.

**Standing up a new agent has a written protocol**, `.claude/agents/STANDUP.md`. **Solutioning comes
first and it is not yours**, and its record is the handoff into the protocol. **Do not scaffold
before it exists**: a folder name reaches DNS and a schema name reaches the database, both settled
by being typed. The `drift` middleware check is roster-independent, so a new app on the base copy
passes.

**Only you watch a pull request.** Joel settled it. One watcher gets the events and a second gets
silence, so two watchers means one is deaf — and it dies with your session, which is the trap below
rather than an exception to it.

**The required checks are `gate`, `drift` and `requested-by-joel`** — switched 2026-09-16, each
bound to the GitHub Actions app rather than to any source. **No agent can read rulesets**, so that
is Joel's screenshot rather than a measurement; treat it as the best available and say so.
**The roster is now free to change.** Adding or deleting an app touches no setting, because `gate`
fails unless the roster step, every per-app build and `drift` all succeeded — the per-app jobs still
report individually for whoever is reading, they are just no longer what the ruleset names.

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
- **`DECISIONS.md` is append-only against a hard ceiling, and `drift` already warns on it.** There
  is no trimming rule for that file, so the wall arrives with no plan behind it. Read the live
  number from `drift` or The Garage, and raise it with Joel before the entry that will not fit.
- **You are a session, not a service.** You do not persist and you do not monitor. Tell Joel which
  mode is live rather than letting him assume the faster one.
- **The `supabase migration repair` hook matches the string in any Bash command**, including one
  that merely writes documentation naming it. Author such files with the Write tool. Do not
  obfuscate the string to get a Bash command through — that is routing around a hook.

## Next

**`packages/shared` is yours to build, not Joel's to approve.** One source at `packages/shared`, a
script that stamps each app's copy from it, `drift` failing a copy that disagrees. It changes no
Vercel setting, no deploy and no build, which is what makes it this seat's. **Not npm workspaces**:
a root install would cost the per-app independence the derived CI matrix rests on.

**The macro tracker's design is in the repo**, at `.claude/MACRO-TRACKER-PLAN.md` — Joel's, and not
a charter. **Missing and blocking the scaffold: the name, and what it must never do.** Supply
neither. The gate's reading of it is issue #98, kept out of the file so the recommendations stay
the technical director's and the design stays Joel's. When those two land, execute `STANDUP.md`
from step 3 rather than re-solutioning what is already agreed.

Everything else waiting is in the ledger, which the `SessionStart` hook prints for you.
