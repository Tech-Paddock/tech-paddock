# Technical Director — handoff

State as of 2026-09-20.

Read `RULES.md` first for the role and the gate. This file is only what is true right now.

---

## In flight

**Nothing.** #152, #153, #154, #155 and #156 all merged on 2026-09-20. **Every branch the previous
handoff listed is on `main`, and the queue is empty.**

## What is true now

**`packages/shared` is the one real copy** of `auth.ts`, `password.ts`, `theme.css`, `theme.ts` and
`next.config.mjs`; `scripts/stamp-shared.mjs` writes it outward and `drift` fails a copy that
disagrees. **Edit canonical and restamp — never a copy.** A lockout fix is one edit now, not six.

**Surface is written**: `.claude/SURFACE.md`. **Page count is not the test** — Coffee, the Resume
Formatter and the Message Editor each have one route and only Coffee is an app. `CLAUDE.md` and
`STANDUP.md` point at it rather than restating it, and `drift` scans it for prose facts.

**`DECISIONS.md` has sections and a 400-line ceiling**, 255 used. **Append inside the section that
describes your entry** — being the last heading is what put 66 lines of decisions under a transfer
runbook. Do not trim to make room; it is not read at session start.

**Previews are off and staying off — Joel ruled on it 2026-09-20**, so **`On track` does not exist**
and there are three phrases and five stages. It was built on a preview trigger and #156 stripped it
out; what it should mean instead is item 3. Each app still builds only when its own folder changes.

**The repository is public** since 2026-09-19 — Actions are free, and **`.claude/` is public
reading**: the charters, the ledger, every carve-out below. Same day, **Postgres stayed yours and
deliveries went to TechPad Gen**: you own the merge, they own what happens after it.

**Branch protection is on**, confirmed against the GitHub API, and **`Require branches to be up to
date` is on** — after any merge every other pull request is behind and must take `main` again.
**The required checks are `gate`, `drift` and `requested-by-joel`**, each bound to the Actions app.
**No agent can read rulesets**, so that last part is Joel's screenshot rather than a measurement.

**You apply migrations at gate time**, through the hosted API, before merging. `supabase db push`
cannot work here and never will — see the traps in `.claude/DECISIONS.md`.

## Traps specific to this seat

- **Check the open list with a live call as the first step of every merge** — not from memory, and
  not from twenty minutes ago. Others open pull requests while you work and you cannot see it.
- **Read the real head SHA before passing `expectedHeadSha`.** Inventing or abbreviating one has now
  been done three times; the guard rejected all three, which is the only reason it costs a retry.
- **A merge refused straight after you edited the body is usually not real** — editing re-queues
  `requested-by-joel`. And **`gate` runs after the whole build matrix**, so a green `drift` means
  nothing on its own; `build (home)` is usually last, being the only app that really builds.
- **Vercel's `ignoreCommand` is capped at 256 characters and the failure is total.** Over it the
  deployment is rejected outright, not built — every deploy of that app stops, production included,
  with CI green throughout. `drift` fails it now at 256 and warns at 200; nothing else would.
- **A dry-run merge on a dirty tree proves nothing.** Stashing first merges an empty branch and
  reports clean. Commit, then dry-run. A green result you did not earn is worse than a red one.
- **Do not backfill another agent's handoff on the way past** — a stale handoff sends the change
  back, and one you write is the second-hand account these files exist to replace.
- **`live: false` on a Vercel project does not mean paused.** Read deployment state — `BLOCKED` is
  paused, `READY` at `target: production` is not. This cost the ledger a false claim for a day.
- **You are a session, not a service** — you do not persist and do not monitor. Say so.
- **The `supabase migration repair` hook matches the string in any Bash command**, including one
  that merely writes documentation naming it. Author such files with the Write tool. Do not
  obfuscate the string to get a Bash command through — that is routing around a hook.

## Next

**Item 1 is the biggest thing here and it is one edit now** — the lockout counter moves from a
signed cookie to a shared table: `packages/shared/lib/auth.ts`, stamp, migration in the same PR.
**Item 5 is minutes** — `shared.contacts` write rules, a contract between the editor (yours, frozen)
and the tracker (TechPad Gen's). **Item 20** wants `drift` comparing what a build reads against what
its `ignoreCommand` watches.

**Waiting on Joel: item 3** (what `On track` means) and **item 21** (the Cookbook's surface, and
`STANDUP.md` step 1). **`claude/health-recipes` must not be deleted** — the only record of its design.

**You are the board rollup** — every agent has one, URLs in `KICKOFF.md`. Joel, 2026-09-19: **a
merge refreshes the merged agent's board too**, their DevOps row and a dated TD banner only. Not in
`CLAUDE.md` yet.
